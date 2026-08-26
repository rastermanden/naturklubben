// Edge Function: badge-notifications
//
// Push-notifikationer om badges (#159):
//   kind: 'nominated' -> admins får besked om, at der ligger en ny indstilling
//                        til godkendelse.
//   kind: 'awarded'   -> det tildelte medlem får besked, og admins får besked
//                        om, at produktionsuret på de 24 timer er startet.
//
// Genbruger push-opsætningen fra chat-push frem for at bygge en ny vej: samme
// push_subscriptions-tabel, samme VAPID-nøgler (som chat-push selv genererer og
// gemmer i push_vapid_keys, hvis de ikke er sat som function-secrets), og samme
// _shared/webpush.ts.
//
// Ligesom chat-push tager functionen kun et id fra klienten -- aldrig teksten.
// Den slår selv op, hvad der skete, og nægter at sende for noget, kalderen ikke
// selv har udløst.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { handleCors } from '../_shared/cors.ts'
import { getVapidDetails } from '../_shared/vapid.ts'
import { sendPushNotification, type VapidDetails } from '../_shared/webpush.ts'

// Den samme guard som i chat-push: et gentaget kald med et gammelt id må ikke
// kunne bruges til at sende notifikationen igen og igen.
const MAX_EVENT_AGE_MS = 5 * 60 * 1000

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

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

function displayName(fullName: string | null | undefined) {
  return fullName?.trim() || 'Et medlem'
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

  let body: { kind?: unknown; nominationId?: unknown; memberBadgeId?: unknown }
  try {
    body = await req.json()
  } catch {
    return respond({ error: 'Ugyldig JSON i request-body' }, 400)
  }
  const kind = body.kind
  if (kind !== 'nominated' && kind !== 'awarded') {
    return respond({ error: 'Ukendt notifikationstype' }, 400)
  }

  let vapid: VapidDetails
  try {
    vapid = await getVapidDetails(supabase)
  } catch (caught) {
    console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
    return respond({ error: 'VAPID-nøglerne kunne ikke hentes' }, 503)
  }

  // Modtagere pr. payload: den samme notifikation skal ikke sendes to gange til
  // en admin, der også er modtageren.
  const groups: { recipients: Set<string>; payload: string }[] = []

  if (kind === 'nominated') {
    if (typeof body.nominationId !== 'string' || !body.nominationId) {
      return respond({ error: 'nominationId er påkrævet' }, 400)
    }

    const { data: nomination, error: nominationError } = await supabase
      .from('badge_nominations')
      .select(
        'id, created_at, nominated_by, badges(name), nominee:profiles!badge_nominations_nominee_id_fkey(full_name), nominator:profiles!badge_nominations_nominated_by_fkey(full_name)',
      )
      .eq('id', body.nominationId)
      .maybeSingle<{
        id: string
        created_at: string
        nominated_by: string
        badges: { name: string } | null
        nominee: { full_name: string | null } | null
        nominator: { full_name: string | null } | null
      }>()
    if (nominationError) {
      console.error('Kunne ikke slå indstillingen op', nominationError)
      return respond({ error: 'Indstillingen kunne ikke slås op' }, 500)
    }
    if (!nomination) return respond({ error: 'Indstillingen findes ikke' }, 404)
    if (nomination.nominated_by !== user.id) {
      return respond({ error: 'Indstillingen er ikke din' }, 403)
    }
    if (
      Date.now() - new Date(nomination.created_at).getTime() >
      MAX_EVENT_AGE_MS
    ) {
      return respond({ skipped: 'Indstillingen er for gammel', sent: 0 })
    }

    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
    if (adminsError) return respond({ error: adminsError.message }, 500)

    const recipients = new Set(
      (admins ?? []).map((admin) => admin.id).filter((id) => id !== user.id),
    )
    groups.push({
      recipients,
      payload: JSON.stringify({
        title: 'Ny indstilling til en badge',
        body: `${displayName(nomination.nominator?.full_name)} har indstillet ${displayName(nomination.nominee?.full_name)} til ${nomination.badges?.name ?? 'en badge'}.`,
        tag: 'naturklubben-badge-nomination',
        path: 'admin',
      }),
    })
  } else {
    if (typeof body.memberBadgeId !== 'string' || !body.memberBadgeId) {
      return respond({ error: 'memberBadgeId er påkrævet' }, 400)
    }

    const { data: actor } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle<{ is_admin: boolean }>()
    if (actor?.is_admin !== true) {
      return respond({ error: 'Kun administratorer kan sende denne' }, 403)
    }

    const { data: awarded, error: awardedError } = await supabase
      .from('member_badges')
      .select(
        'id, awarded_at, profile_id, badges(name), profiles!member_badges_profile_id_fkey(full_name)',
      )
      .eq('id', body.memberBadgeId)
      .maybeSingle<{
        id: string
        awarded_at: string
        profile_id: string
        badges: { name: string } | null
        profiles: { full_name: string | null } | null
      }>()
    if (awardedError) {
      console.error('Kunne ikke slå tildelingen op', awardedError)
      return respond({ error: 'Tildelingen kunne ikke slås op' }, 500)
    }
    if (!awarded) return respond({ error: 'Tildelingen findes ikke' }, 404)
    if (
      Date.now() - new Date(awarded.awarded_at).getTime() >
      MAX_EVENT_AGE_MS
    ) {
      return respond({ skipped: 'Tildelingen er for gammel', sent: 0 })
    }

    const badgeName = awarded.badges?.name ?? 'en badge'
    const memberName = displayName(awarded.profiles?.full_name)

    groups.push({
      recipients: new Set([awarded.profile_id]),
      payload: JSON.stringify({
        title: 'Du har fået en badge!',
        body: `${badgeName} er tildelt dig. Se den på din profil.`,
        tag: `naturklubben-badge-awarded-${awarded.id}`,
        path: 'profil',
      }),
    })

    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
    if (adminsError) return respond({ error: adminsError.message }, 500)

    const adminRecipients = new Set(
      (admins ?? [])
        .map((admin) => admin.id)
        .filter((id) => id !== user.id && id !== awarded.profile_id),
    )
    groups.push({
      recipients: adminRecipients,
      payload: JSON.stringify({
        title: 'Et badge skal produceres',
        body: `${memberName} har fået ${badgeName}. Det fysiske badge skal være klar inden 24 timer.`,
        tag: `naturklubben-badge-production-${awarded.id}`,
        path: 'admin',
      }),
    })
  }

  const userIds = [...new Set(groups.flatMap((group) => [...group.recipients]))]
  if (userIds.length === 0) return respond({ sent: 0, failed: 0, removed: 0 })

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (subscriptionsError) {
    return respond({ error: subscriptionsError.message }, 500)
  }

  const deliveries = groups.flatMap((group) =>
    ((subscriptions ?? []) as Subscription[])
      .filter((subscription) => group.recipients.has(subscription.user_id))
      .map((subscription) => ({ subscription, payload: group.payload })),
  )

  const results = await Promise.allSettled(
    deliveries.map(async ({ subscription, payload }) => {
      const result = await sendPushNotification(subscription, payload, vapid)
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
      console.error('Badge-push fejlede', result.reason)
      continue
    }
    if (result.value.isGone) {
      removed += 1
    } else if (result.value.status >= 200 && result.value.status < 300) {
      sent += 1
    } else {
      failed += 1
      console.error('Badge-push afvist af tjenesten', result.value.status)
    }
  }

  return respond({ sent, failed, removed })
})
