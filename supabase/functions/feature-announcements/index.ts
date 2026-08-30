// Edge Function: feature-announcements
//
// Sender push-notifikationen om en ny funktion ud til klubben. Nyhederne selv
// oprettes af migrationer (tabellen feature_announcements) -- functionen her
// er kun leveringen.
//
// POST (uden body) -> { announcements, sent, skipped, failed, removed }
//   Kaldes af klienten, første gang et medlem åbner appen efter et deploy.
//   Kalderen bestemmer intet: den siger ikke hvad der skal sendes eller til
//   hvem, og payloaden er tom. Functionen slår selv de udestående nyheder op
//   og tager hver enkelt med claim_feature_announcement_push, som kun lykkes
//   én gang -- to medlemmer, der åbner appen samtidig, sender altså ikke to
//   notifikationer om det samme.
//
//   Hvad der faktisk nåede frem, står i feature_announcement_push_deliveries.
//   Et genforsøg -- de findes, fordi ét dødt endpoint ellers vælter hele
//   udsendelsen -- springer de enheder over, der allerede har fået nyheden.
//
// Hvorfor klienten og ikke databasen? probation-notifications kalder sig selv
// via pg_net, men udleder functionens URL af requestets host-header. En nyhed
// oprettes af en migration, hvor der ikke er nogen. Klientkaldet er den
// mindste vej udenom, og outboxen gør det harmløst at kalde for meget.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { handleCors } from '../_shared/cors.ts'
import { getVapidDetails } from '../_shared/vapid.ts'
import { sendPushNotification, type VapidDetails } from '../_shared/webpush.ts'
import {
  announcementPayload,
  selectAnnouncementRecipients,
  selectUndeliveredRecipients,
  type FeatureAnnouncement,
  type PushSubscriptionRow,
} from './announcements.ts'

function jsonResponse(body: unknown, corsHeaders: Headers, status = 200) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false } },
  )
}

Deno.serve(async (req) => {
  const cors = handleCors(req, { methods: ['POST'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers
  const respond = (body: unknown, status = 200) =>
    jsonResponse(body, corsHeaders, status)

  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  const supabase = serviceClient()

  const accessToken = req.headers.get('Authorization')?.replace(/^Bearer /i, '')
  if (!accessToken) return respond({ error: 'Ikke autentificeret' }, 401)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)
  if (userError || !user) return respond({ error: 'Ikke autentificeret' }, 401)

  const { data: pending, error: pendingError } = await supabase.rpc(
    'pending_feature_announcement_pushes',
  )
  if (pendingError) {
    console.error('Kunne ikke slå udestående nyheder op', pendingError)
    return respond({ error: 'Nyhederne kunne ikke slås op' }, 500)
  }

  const announcements = (pending ?? []) as FeatureAnnouncement[]
  if (announcements.length === 0) {
    return respond({
      announcements: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      removed: 0,
    })
  }

  let vapid: VapidDetails
  try {
    vapid = await getVapidDetails(supabase)
  } catch (caught) {
    console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
    return respond({ error: 'VAPID-nøglerne kunne ikke hentes' }, 503)
  }

  // Præferencen og abonnementerne hentes én gang for alle nyhederne: er der
  // undtagelsesvis to udestående, er kredsen, der vil have nyheder, den samme.
  // Hvem der allerede har fået *den enkelte* nyhed, slås derimod op pr. nyhed
  // nedenfor.
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, feature_notifications_enabled')
  if (profilesError) return respond({ error: profilesError.message }, 500)

  const preferences = new Map<string, boolean>()
  for (const profile of profiles ?? []) {
    preferences.set(
      profile.id as string,
      profile.feature_notifications_enabled !== false,
    )
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
  if (subscriptionsError) {
    return respond({ error: subscriptionsError.message }, 500)
  }

  const recipients = selectAnnouncementRecipients({
    subscriptions: (subscriptions ?? []) as PushSubscriptionRow[],
    preferences,
  })

  let claimed = 0
  let sent = 0
  let skipped = 0
  let failed = 0
  let removed = 0

  for (const announcement of announcements) {
    // Leveringsloggen læses før claim'en, så en fejl her ikke bruger et af
    // nyhedens ti forsøg. Er en anden klient allerede i gang, får claim'en
    // nedenfor 0, og vi rører ikke nyheden.
    const { data: deliveredRows, error: deliveredError } = await supabase
      .from('feature_announcement_push_deliveries')
      .select('subscription_id')
      .eq('announcement_id', announcement.id)
    if (deliveredError) {
      console.error('Kunne ikke læse leveringsloggen', deliveredError)
      continue
    }
    const delivered = new Set(
      (deliveredRows ?? []).map((row) => row.subscription_id as string),
    )

    const { data: attempt, error: claimError } = await supabase.rpc(
      'claim_feature_announcement_push',
      { announcement_id: announcement.id },
    )
    if (claimError) {
      console.error('Kunne ikke tage nyheden', claimError)
      continue
    }
    // 0 = en anden klient nåede den først, eller nyheden faldt ud af vinduet
    // mellem opslaget og claim'en.
    if (!attempt) continue
    claimed += 1

    // Kun de enheder, der stadig mangler nyheden. Et genforsøg findes for de
    // leveringer, der slog fejl -- ikke for at gentage dem, der lykkedes.
    const targets = selectUndeliveredRecipients(recipients, delivered)
    skipped += recipients.length - targets.length

    const payload = announcementPayload(announcement)
    const results = await Promise.allSettled(
      targets.map(async (subscription) => {
        const result = await sendPushNotification(subscription, payload, vapid)
        if (result.isGone) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', subscription.id)
        }
        return { subscriptionId: subscription.id, ...result }
      }),
    )

    let announcementFailed = 0
    let lastError: string | null = null
    const deliveredNow: string[] = []
    for (const result of results) {
      if (result.status === 'rejected') {
        announcementFailed += 1
        lastError = String(result.reason)
        console.error('Nyhedspush fejlede', result.reason)
        continue
      }
      if (result.value.isGone) {
        removed += 1
      } else if (result.value.status >= 200 && result.value.status < 300) {
        sent += 1
        deliveredNow.push(result.value.subscriptionId)
      } else {
        announcementFailed += 1
        lastError = `Push-tjenesten svarede ${result.value.status}`
        console.error('Nyhedspush afvist af tjenesten', result.value.status)
      }
    }
    failed += announcementFailed

    // De leveringer, der lykkedes, skrives ned med det samme, så et genforsøg
    // kan lade dem være.
    let ledgerFailed = false
    if (deliveredNow.length > 0) {
      const { error: ledgerError } = await supabase
        .from('feature_announcement_push_deliveries')
        .upsert(
          deliveredNow.map((subscriptionId) => ({
            announcement_id: announcement.id,
            subscription_id: subscriptionId,
          })),
          {
            onConflict: 'announcement_id,subscription_id',
            ignoreDuplicates: true,
          },
        )
      if (ledgerError) {
        ledgerFailed = true
        console.error('Kunne ikke skrive leveringsloggen', ledgerError)
      }
    }

    // Nyheden er leveret, når ingen af de forsøg, der blev gjort, fejlede --
    // også hvis der ingen abonnementer var tilbage at sende til. Ellers ryger
    // den tilbage som 'failed' og forsøges igen ved næste kald, indtil vinduet
    // lukker.
    //
    // Kunne leveringerne ikke skrives ned, lukkes nyheden alligevel: et
    // genforsøg ville ikke vide, hvem der lige har fået den, og sende til dem
    // igen. Hellere en notifikation, der mangler, end den samme to gange.
    const { error: completeError } = await supabase.rpc(
      'complete_feature_announcement_push',
      {
        announcement_id: announcement.id,
        expected_attempt: attempt,
        succeeded: announcementFailed === 0 || ledgerFailed,
        failure_message:
          announcementFailed === 0 || ledgerFailed
            ? null
            : `${announcementFailed} af ${results.length} notifikationer fejlede. Sidste fejl: ${lastError}`,
      },
    )
    if (completeError) {
      console.error('Kunne ikke opdatere nyhedens status', completeError)
    }
  }

  return respond({ announcements: claimed, sent, skipped, failed, removed })
})
