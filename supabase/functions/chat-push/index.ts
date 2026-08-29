// Edge Function: chat-push
//
// Sender en Web Push-notifikation til de andre medlemmers telefoner, når nogen
// skriver i chatten (#14) -- så vidt de vil have den: hvert medlem vælger på
// sin profil mellem alle beskeder, kun når det nævnes, og ingen (#179).
// Filtreringen sker her, fordi klienten ikke kan undlade at modtage en
// notifikation, den allerede har fået.
//
// To endpoints i én function:
//   GET   -> { publicKey } : VAPID-nøglen, klienten skal abonnere med. Den
//            hentes herfra i stedet for at bygges ind i frontenden, så
//            nøglerne kun findes ét sted på serveren og kan roteres uden et
//            nyt frontend-build.
//   POST  -> { messageId } : kaldes af afsenderens klient lige efter beskeden
//            er indsat (samme mønster som optimize-image kaldes efter en
//            upload). Functionen slår selv beskeden op og nægter at sende for
//            en besked, kalderen ikke selv har skrevet -- payloaden fra
//            klienten er kun et id, aldrig indholdet.
//
// Secret key er reserveret og auto-injiceres af platformen (kan ikke sættes
// med `supabase secrets set`) -- SUPABASE_SERVICE_ROLE_KEY er det historiske
// navn, så vi falder tilbage til det. VAPID-nøglerne kommer fra
// function-secrets, hvis de er sat -- ellers genererer og gemmer functionen
// selv et nøglepar første gang (se vapid.ts).

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { handleCors } from '../_shared/cors.ts'
import { getVapidDetails } from '../_shared/vapid.ts'
import { sendPushNotification, type VapidDetails } from '../_shared/webpush.ts'
import {
  chatPushPayload,
  normalizePreference,
  selectRecipients,
  type ChatNotificationPreference,
} from './recipients.ts'

// Notifikationsteksten er et smugkig, ikke hele beskeden -- resten læses i
// appen. Holder også payloaden langt under push-tjenesternes 4 KB-grænse.
const PREVIEW_MAX_LENGTH = 140

// En besked, der er mere end et par minutter gammel, er ikke "ny". Guarden
// gør, at et gentaget kald med et gammelt messageId ikke kan bruges til at
// spamme klubben med notifikationer om den samme besked.
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000

function jsonResponse(body: unknown, corsHeaders: Headers, status = 200) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false } },
  )
}

function previewOf(content: string) {
  const trimmed = content.trim().replace(/\s+/g, ' ')
  return trimmed.length > PREVIEW_MAX_LENGTH
    ? `${trimmed.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
    : trimmed
}

Deno.serve(async (req) => {
  const cors = handleCors(req, { methods: ['GET', 'POST'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405)
  }

  const supabase = serviceClient()

  // Findes nøgleparret ikke endnu, oprettes det her -- det er derfor et
  // GET-kald fra en almindelig klient er nok til at konfigurere serveren.
  // 503 er nu forbeholdt det tilfælde, at databasen ikke kan svare (fx før
  // migrationen er deployet), ikke manglende opsætning.
  let vapid: VapidDetails
  try {
    vapid = await getVapidDetails(supabase)
  } catch (caught) {
    console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
    return jsonResponse(
      { error: 'VAPID-nøglerne kunne ikke hentes eller oprettes' },
      corsHeaders,
      503,
    )
  }

  if (req.method === 'GET') {
    return jsonResponse({ publicKey: vapid.publicKey }, corsHeaders)
  }

  const accessToken = req.headers.get('Authorization')?.replace(/^Bearer /i, '')
  if (!accessToken) {
    return jsonResponse({ error: 'Ikke autentificeret' }, corsHeaders, 401)
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)
  if (userError || !user) {
    return jsonResponse({ error: 'Ikke autentificeret' }, corsHeaders, 401)
  }

  let messageId: string | undefined
  try {
    ;({ messageId } = await req.json())
  } catch {
    return jsonResponse(
      { error: 'Ugyldig JSON i request-body' },
      corsHeaders,
      400,
    )
  }
  if (!messageId) {
    return jsonResponse({ error: 'messageId er påkrævet' }, corsHeaders, 400)
  }

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select('id, user_id, content, created_at, mentions')
    .eq('id', messageId)
    .single()
  if (messageError || !message) {
    return jsonResponse({ error: 'Beskeden findes ikke' }, corsHeaders, 404)
  }
  if (message.user_id !== user.id) {
    return jsonResponse({ error: 'Beskeden er ikke din' }, corsHeaders, 403)
  }
  if (
    Date.now() - new Date(message.created_at).getTime() >
    MAX_MESSAGE_AGE_MS
  ) {
    return jsonResponse(
      { skipped: 'Beskeden er for gammel', sent: 0 },
      corsHeaders,
    )
  }

  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Alle andre end afsenderen selv -- man skal ikke have en notifikation om
  // sin egen besked på sin anden enhed heller.
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .neq('user_id', user.id)
  if (subscriptionsError) {
    return jsonResponse({ error: subscriptionsError.message }, corsHeaders, 500)
  }
  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removed: 0 }, corsHeaders)
  }

  // Præferencerne hentes for netop de medlemmer, der har et abonnement --
  // resten er der alligevel ingen at sende til.
  const subscriberIds = [...new Set(subscriptions.map((row) => row.user_id))]
  const { data: preferenceRows, error: preferencesError } = await supabase
    .from('profiles')
    .select('id, chat_notification_preference')
    .in('id', subscriberIds)
  if (preferencesError) {
    return jsonResponse({ error: preferencesError.message }, corsHeaders, 500)
  }

  const preferences = new Map<string, ChatNotificationPreference>()
  for (const row of preferenceRows ?? []) {
    preferences.set(
      row.id as string,
      normalizePreference(row.chat_notification_preference),
    )
  }

  const recipients = selectRecipients({
    subscriptions,
    preferences,
    mentionedIds: (message.mentions ?? []) as string[],
    senderId: user.id,
  })
  if (recipients.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removed: 0 }, corsHeaders)
  }

  const preview = previewOf(message.content)

  const results = await Promise.allSettled(
    recipients.map(async ({ subscription, isMentioned }) => {
      const result = await sendPushNotification(
        subscription,
        chatPushPayload({
          senderName: senderProfile?.full_name,
          preview,
          messageId: message.id,
          isMentioned,
        }),
        vapid,
      )
      if (result.isGone) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', subscription.id)
      }
      return result
    }),
  )

  let sent = 0
  let failed = 0
  let removed = 0
  for (const result of results) {
    if (result.status === 'rejected') {
      failed += 1
      console.error('Push fejlede', result.reason)
      continue
    }
    if (result.value.isGone) {
      removed += 1
    } else if (result.value.status >= 200 && result.value.status < 300) {
      sent += 1
    } else {
      failed += 1
      console.error('Push afvist af tjenesten', result.value.status)
    }
  }

  return jsonResponse({ sent, failed, removed }, corsHeaders)
})
