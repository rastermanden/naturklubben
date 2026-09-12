// Edge Function: event-guest-notifications
//
// Sender svaret (godkendt/afvist) som e-mail til en gæst, der har søgt om at
// deltage i en åben begivenhed (#224). Databasen ejer den holdbare
// pending/sending/sent/failed-status på event_guest_requests; functionen ejer
// kun selve mailkaldet og bruger den auto-injicerede Secret key.
//
// Kaldes af Postgres (pg_net efter commit, pg_cron ved genforsøg) med
// ansøgningens tilfældige notification-token, eller af arrangøren/en admin
// fra browseren med deres eget access-token for at vise resultatet med det
// samme. Gateway-JWT er derfor slået fra; hvert POST laver sin egen kontrol.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { handleCors } from '../_shared/cors.ts'
import { emailSenderFromEnv, sendEmail } from '../_shared/email.ts'
import { guestDecisionEmail } from '../_shared/guestDecisionEmail.ts'

interface DeliveryRequest {
  requestId?: string
  notificationToken?: string
}

interface GuestRequest {
  id: string
  event_id: string
  full_name: string
  email: string
  party_size: number
  status: 'pending' | 'approved' | 'rejected'
  notification_token: string
  decision_notification_status: string | null
  decision_notification_error: string | null
}

interface GuestEvent {
  id: string
  title: string
  location: string | null
  start_at: string
  end_at: string | null
  created_by: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createJsonResponse(body: unknown, corsHeaders: Headers, status = 200) {
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

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

// Arrangøren (events.created_by) eller en admin må udløse leveringen selv.
async function callerMayNotify(
  supabase: ReturnType<typeof serviceClient>,
  req: Request,
  event: GuestEvent,
) {
  const token = bearerToken(req)
  if (!token) return false

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) return false
  if (event.created_by === user.id) return true

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin === true
}

async function completeDelivery(
  supabase: ReturnType<typeof serviceClient>,
  requestId: string,
  expectedAttempt: number,
  succeeded: boolean,
  failureMessage: string | null,
) {
  const { error } = await supabase.rpc('complete_event_guest_notification', {
    request_id: requestId,
    expected_attempt: expectedAttempt,
    succeeded,
    failure_message: failureMessage,
  })
  if (error) throw error
}

Deno.serve(async (req) => {
  const cors = handleCors(req, { methods: ['POST'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers
  const jsonResponse = (body: unknown, status = 200) =>
    createJsonResponse(body, corsHeaders, status)

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let request: DeliveryRequest
  try {
    request = await req.json()
  } catch {
    return jsonResponse({ error: 'Ugyldig JSON i request-body' }, 400)
  }

  const { requestId, notificationToken } = request
  if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId)) {
    return jsonResponse({ error: 'requestId er påkrævet' }, 400)
  }

  const supabase = serviceClient()

  const { data: guestRequest, error: requestError } = await supabase
    .from('event_guest_requests')
    .select(
      'id, event_id, full_name, email, party_size, status, notification_token, decision_notification_status, decision_notification_error',
    )
    .eq('id', requestId)
    .single<GuestRequest>()
  if (requestError || !guestRequest) {
    return jsonResponse({ error: 'Ikke autoriseret' }, 403)
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, location, start_at, end_at, created_by')
    .eq('id', guestRequest.event_id)
    .single<GuestEvent>()
  if (eventError || !event) {
    return jsonResponse({ error: 'Ikke autoriseret' }, 403)
  }

  const ownsRequest =
    typeof notificationToken === 'string' &&
    notificationToken === guestRequest.notification_token
  if (!ownsRequest && !(await callerMayNotify(supabase, req, event))) {
    return jsonResponse({ error: 'Ikke autoriseret' }, 403)
  }
  if (
    guestRequest.status !== 'approved' &&
    guestRequest.status !== 'rejected'
  ) {
    return jsonResponse({ error: 'Ansøgningen er ikke afgjort endnu' }, 409)
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_event_guest_notification',
    { request_id: requestId },
  )
  if (claimError) {
    console.error('Kunne ikke tage svaret til levering', claimError)
    return jsonResponse({ error: 'Leveringen kunne ikke startes' }, 500)
  }
  if (typeof claimed !== 'number' || claimed < 1) {
    const { data: current } = await supabase
      .from('event_guest_requests')
      .select('decision_notification_status, decision_notification_error')
      .eq('id', requestId)
      .single()
    return jsonResponse({
      status: current?.decision_notification_status,
      skipped: true,
      ...(current?.decision_notification_error
        ? { error: current.decision_notification_error }
        : {}),
    })
  }

  try {
    const sender = emailSenderFromEnv()
    if (!sender) {
      const message =
        'Der er ikke sat en mailudbyder op (RESEND_API_KEY mangler). Giv gæsten besked på anden vis.'
      await completeDelivery(supabase, requestId, claimed, false, message)
      return jsonResponse({ status: 'failed', error: message })
    }

    const mail = guestDecisionEmail({
      status: guestRequest.status,
      fullName: guestRequest.full_name,
      partySize: guestRequest.party_size,
      event,
    })
    const result = await sendEmail({ to: guestRequest.email, ...mail }, sender)
    const failureMessage = result.ok
      ? null
      : (result.error ?? 'Mailen kunne ikke sendes.')
    await completeDelivery(
      supabase,
      requestId,
      claimed,
      result.ok,
      failureMessage,
    )

    return jsonResponse({
      status: result.ok ? 'sent' : 'failed',
      ...(failureMessage ? { error: failureMessage } : {}),
    })
  } catch (caught) {
    console.error('Mailen til gæsten fejlede', caught)
    const message = 'Mailen kunne ikke sendes. Prøv igen.'
    try {
      await completeDelivery(supabase, requestId, claimed, false, message)
    } catch (completionError) {
      console.error('Kunne ikke gemme leveringsfejlen', completionError)
    }
    return jsonResponse({ status: 'failed', error: message })
  }
})
