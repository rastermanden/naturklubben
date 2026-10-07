// Edge Function: calendar-push
//
// Push-notifikationer om kalenderen (#216):
//   kind: 'event_created'      -> alle andre medlemmer får besked om en ny
//                             begivenhed. Kaldes af opretterens egen klient
//                             lige efter indsættelsen (samme mønster som
//                             chat-push); klienten sender kun id'et, functionen
//                             slår selv begivenheden op og nægter at sende for
//                             en, kalderen ikke selv har oprettet.
//   kind: 'event_reminder'     -> de tilmeldte får en påmindelse dagen før.
//                             Kaldes fra databasen: pg_cron finder
//                             begivenhederne (enqueue_event_reminders) og
//                             pg_net poster hertil med kørslens token. Der er
//                             ingen bruger bag det kald, så functionen
//                             deployes med --no-verify-jwt og bekræfter selv
//                             token mod event_reminders.
//   kind: 'waitlist_promoted'  -> de(n), der lige rykkede op fra ventelisten,
//                             får besked ud over chatten (#236). Kaldes af
//                             klienten, hvis handling gav pladsen (et afbud
//                             eller et hævet loft), lige efter respond_to_event
//                             eller promote_event_waitlist. Klienten sender kun
//                             eventId og de id'er, RPC'en selv gav den tilbage
//                             -- functionen stoler ikke på den liste blindt, men
//                             snævrer den ind til dem, der reelt sidder på en
//                             attending-plads til begivenheden nu
//                             (_shared/waitlistPromotionRecipients.ts), og
//                             nægter at sende, hvis kalderen ikke selv har noget
//                             med begivenheden at gøre.
//
// Hvem der får hvad, og at ingen får det samme to gange, afgøres i
// _shared/pushDelivery.ts: præferencer, abonnementer og leveringsloggen.
// Chat-push er uændret; denne function ligger ved siden af.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { handleCors } from '../_shared/cors.ts'
import { loadEventReminderRecipients } from '../_shared/eventReminderRecipients.ts'
import { loadWaitlistPromotionRecipients } from '../_shared/waitlistPromotionRecipients.ts'
import { deliverPush } from '../_shared/pushDelivery.ts'
import {
  eventCreatedPayload,
  eventReminderPayload,
  waitlistPromotedPayload,
  type EventSummary,
} from '../_shared/pushPayloads.ts'
import { getVapidDetails } from '../_shared/vapid.ts'
import type { VapidDetails } from '../_shared/webpush.ts'

// Samme guard som i chat-push: et gentaget kald med et gammelt id må ikke
// kunne bruges til at sende notifikationen igen og igen. Leveringsloggen
// stopper det også, men guarden sparer opslagene.
const MAX_EVENT_AGE_MS = 5 * 60 * 1000

interface EventRow extends EventSummary {
  created_at: string
  created_by: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

async function loadEvent(
  supabase: ReturnType<typeof serviceClient>,
  eventId: string,
) {
  return await supabase
    .from('events')
    .select('id, title, start_at, location, created_at, created_by')
    .eq('id', eventId)
    .maybeSingle<EventRow>()
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

  let body: {
    kind?: unknown
    eventId?: unknown
    token?: unknown
    userIds?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return respond({ error: 'Ugyldig JSON i request-body' }, 400)
  }
  const { kind, eventId, token } = body
  if (
    kind !== 'event_created' &&
    kind !== 'event_reminder' &&
    kind !== 'waitlist_promoted'
  ) {
    return respond({ error: 'Ukendt notifikationstype' }, 400)
  }
  if (typeof eventId !== 'string' || !UUID_PATTERN.test(eventId)) {
    return respond({ error: 'eventId er påkrævet' }, 400)
  }

  const supabase = serviceClient()

  if (kind === 'event_created') {
    const accessToken = req.headers
      .get('Authorization')
      ?.replace(/^Bearer /i, '')
    if (!accessToken) return respond({ error: 'Ikke autentificeret' }, 401)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return respond({ error: 'Ikke autentificeret' }, 401)
    }

    const { data: event, error: eventError } = await loadEvent(
      supabase,
      eventId,
    )
    if (eventError) {
      console.error('Kunne ikke slå begivenheden op', eventError)
      return respond({ error: 'Begivenheden kunne ikke slås op' }, 500)
    }
    if (!event) return respond({ error: 'Begivenheden findes ikke' }, 404)
    if (event.created_by !== user.id) {
      return respond({ error: 'Begivenheden er ikke din' }, 403)
    }
    if (Date.now() - new Date(event.created_at).getTime() > MAX_EVENT_AGE_MS) {
      return respond({ skipped: 'Begivenheden er for gammel', sent: 0 })
    }

    let vapid: VapidDetails
    try {
      vapid = await getVapidDetails(supabase)
    } catch (caught) {
      console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
      return respond({ error: 'VAPID-nøglerne kunne ikke hentes' }, 503)
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle<{ full_name: string | null }>()

    // Alle andre end opretteren selv -- man skal ikke have besked om sin egen
    // begivenhed på sin anden enhed heller.
    const { data: members, error: membersError } = await supabase
      .from('profiles')
      .select('id')
      .neq('id', user.id)
    if (membersError) return respond({ error: membersError.message }, 500)

    try {
      const result = await deliverPush({
        supabase,
        vapid,
        kind,
        subjectId: event.id,
        userIds: (members ?? []).map((member) => member.id as string),
        payload: eventCreatedPayload({
          event,
          creatorName: creator?.full_name,
        }),
      })
      return respond(result)
    } catch (caught) {
      console.error('Notifikationen om den nye begivenhed fejlede', caught)
      return respond({ error: 'Notifikationen kunne ikke sendes' }, 500)
    }
  }

  if (kind === 'waitlist_promoted') {
    const accessToken = req.headers
      .get('Authorization')
      ?.replace(/^Bearer /i, '')
    if (!accessToken) return respond({ error: 'Ikke autentificeret' }, 401)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return respond({ error: 'Ikke autentificeret' }, 401)
    }

    const candidateIds = body.userIds
    if (
      !Array.isArray(candidateIds) ||
      candidateIds.length === 0 ||
      !candidateIds.every(
        (id): id is string => typeof id === 'string' && UUID_PATTERN.test(id),
      )
    ) {
      return respond({ error: 'userIds er påkrævet' }, 400)
    }

    const { data: event, error: eventError } = await loadEvent(
      supabase,
      eventId,
    )
    if (eventError) {
      console.error('Kunne ikke slå begivenheden op', eventError)
      return respond({ error: 'Begivenheden kunne ikke slås op' }, 500)
    }
    if (!event) return respond({ error: 'Begivenheden findes ikke' }, 404)

    // Kalderen skal selv have noget med begivenheden at gøre -- arrangøren,
    // en admin, eller et medlem, der har svaret på den (attending,
    // waitlisted eller declined). Ellers er der intet, kalderen kan vide om
    // begivenheden, og intet at fortælle nogen om.
    if (event.created_by !== user.id) {
      const { data: actor } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle<{ is_admin: boolean }>()
      if (actor?.is_admin !== true) {
        const { data: ownResponse } = await supabase
          .from('event_attendance')
          .select('user_id')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!ownResponse) {
          return respond({ error: 'Begivenheden er ikke din' }, 403)
        }
      }
    }

    let vapid: VapidDetails
    try {
      vapid = await getVapidDetails(supabase)
    } catch (caught) {
      console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
      return respond({ error: 'VAPID-nøglerne kunne ikke hentes' }, 503)
    }

    try {
      // Snævrer kandidaterne ind til dem, der reelt sidder på en
      // attending-plads til denne begivenhed lige nu -- klientens liste
      // stoles der ikke blindt på (se _shared/waitlistPromotionRecipients.ts).
      const recipients = await loadWaitlistPromotionRecipients(
        supabase,
        eventId,
        candidateIds,
      )
      if (recipients.length === 0) {
        return respond({ skipped: 'Ingen af id’erne deltager', sent: 0 })
      }
      const result = await deliverPush({
        supabase,
        vapid,
        kind,
        subjectId: event.id,
        userIds: recipients,
        payload: waitlistPromotedPayload({ event }),
      })
      return respond(result)
    } catch (caught) {
      console.error('Notifikationen om oprykningen fejlede', caught)
      return respond({ error: 'Notifikationen kunne ikke sendes' }, 500)
    }
  }

  // event_reminder: kaldes fra databasen med kørslens token.
  if (typeof token !== 'string' || !UUID_PATTERN.test(token)) {
    return respond({ error: 'Ikke autoriseret' }, 403)
  }
  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_event_reminder',
    { p_event_id: eventId, p_token: token },
  )
  if (claimError) {
    console.error('Kunne ikke tage påmindelsen til levering', claimError)
    return respond({ error: 'Påmindelsen kunne ikke startes' }, 500)
  }
  // 0: forkert token, eller kørslen er allerede afsluttet -- fx et forsinket
  // pg_net-request, der kommer efter, at et nyere har taget over.
  if (typeof claimed !== 'number' || claimed < 1) {
    return respond({ error: 'Ikke autoriseret' }, 403)
  }

  const complete = async (
    succeeded: boolean,
    failureMessage: string | null,
  ) => {
    const { error } = await supabase.rpc('complete_event_reminder', {
      p_event_id: eventId,
      p_expected_attempt: claimed,
      p_succeeded: succeeded,
      p_failure_message: failureMessage,
    })
    if (error) console.error('Kunne ikke gemme påmindelsens status', error)
  }

  try {
    const { data: event, error: eventError } = await loadEvent(
      supabase,
      eventId,
    )
    if (eventError) throw eventError
    if (!event) {
      await complete(false, 'Begivenheden findes ikke længere.')
      return respond({ status: 'failed', error: 'Begivenheden findes ikke' })
    }
    // En begivenhed, der allerede er i gang, er der ingen grund til at minde
    // om. Kørslen lukkes som sendt, så cron ikke bliver ved.
    if (new Date(event.start_at).getTime() <= Date.now()) {
      await complete(true, null)
      return respond({ status: 'sent', skipped: 'Begivenheden er begyndt' })
    }

    const userIds = await loadEventReminderRecipients(supabase, event.id)

    const vapid = await getVapidDetails(supabase)
    const result = await deliverPush({
      supabase,
      vapid,
      kind,
      subjectId: event.id,
      userIds,
      payload: eventReminderPayload({ event }),
    })

    // Påmindelsen er leveret, når ingen af de forsøg, der blev gjort, fejlede
    // -- også hvis der ingen tilmeldte var. Fejlede nogen, ryger kørslen
    // tilbage som 'failed' og forsøges igen om et kvarter; de medlemmer, der
    // fik den, står i leveringsloggen og får den ikke igen.
    const succeeded = result.failed === 0
    await complete(
      succeeded,
      succeeded
        ? null
        : `${result.failed} af ${result.sent + result.failed} notifikationer fejlede.`,
    )
    return respond({ status: succeeded ? 'sent' : 'failed', ...result })
  } catch (caught) {
    console.error('Påmindelsen kunne ikke leveres', caught)
    await complete(false, 'Påmindelsen kunne ikke leveres.')
    return respond({
      status: 'failed',
      error: 'Påmindelsen kunne ikke leveres',
    })
  }
})
