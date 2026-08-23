// Edge Function: probation-notifications
//
// Leverer Web Push for prøvemedlemskabsflowet. Databasen ejer den holdbare
// pending/sending/sent/failed-status; functionen ejer kun HTTP-kaldene til
// browsernes push-tjenester og bruger den auto-injicerede Secret key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getVapidDetails } from '../_shared/vapid.ts'
import { sendPushNotification } from '../_shared/webpush.ts'

type NotificationKind = 'admin' | 'decision'

interface DeliveryRequest {
  applicationId?: number
  kind?: NotificationKind
  notificationToken?: string
}

interface Application {
  id: number
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  notification_token: string
  admin_notification_status: string
  decision_notification_status: string | null
}

interface Subscription {
  id?: string
  application_id?: number
  endpoint: string
  p256dh: string
  auth: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

async function callerIsAdmin(
  supabase: ReturnType<typeof serviceClient>,
  req: Request,
) {
  const token = bearerToken(req)
  if (!token) return false

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin === true
}

async function adminSubscriptions(
  supabase: ReturnType<typeof serviceClient>,
): Promise<Subscription[]> {
  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
  if (adminsError) throw adminsError
  if (!admins || admins.length === 0) return []

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in(
      'user_id',
      admins.map((admin) => admin.id),
    )
  if (error) throw error
  return data ?? []
}

async function applicantSubscriptions(
  supabase: ReturnType<typeof serviceClient>,
  applicationId: number,
): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('probation_application_push_subscriptions')
    .select('application_id, endpoint, p256dh, auth')
    .eq('application_id', applicationId)
  if (error) throw error
  return data ?? []
}

function payloadFor(application: Application, kind: NotificationKind) {
  if (kind === 'admin') {
    const applicantName = application.full_name.trim().slice(0, 120)
    return {
      title: 'Ny ansøgning om prøvemedlemskab',
      body: `${applicantName} har sendt en ansøgning.`,
      tag: `probation-application-${application.id}`,
      path: 'admin',
    }
  }

  if (application.status === 'approved') {
    return {
      title: 'Din ansøgning er godkendt',
      body: 'Du kan nu oprette en bruger i Naturklubben.',
      tag: `probation-decision-${application.id}`,
      path: 'opret',
    }
  }

  return {
    title: 'Svar på din ansøgning',
    body: 'Din ansøgning om prøvemedlemskab er blevet afvist.',
    tag: `probation-decision-${application.id}`,
    path: 'proevemedlemskab',
  }
}

async function completeDelivery(
  supabase: ReturnType<typeof serviceClient>,
  applicationId: number,
  kind: NotificationKind,
  expectedAttempt: number,
  succeeded: boolean,
  failureMessage: string | null,
) {
  const { error } = await supabase.rpc('complete_probation_notification', {
    application_id: applicationId,
    notification_kind: kind,
    expected_attempt: expectedAttempt,
    succeeded,
    failure_message: failureMessage,
  })
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabase = serviceClient()

  if (req.method === 'GET') {
    try {
      const vapid = await getVapidDetails(supabase)
      return jsonResponse({ publicKey: vapid.publicKey })
    } catch (caught) {
      console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
      return jsonResponse(
        { error: 'VAPID-nøglerne kunne ikke hentes eller oprettes' },
        503,
      )
    }
  }

  let request: DeliveryRequest
  try {
    request = await req.json()
  } catch {
    return jsonResponse({ error: 'Ugyldig JSON i request-body' }, 400)
  }

  const { applicationId, kind, notificationToken } = request
  if (
    typeof applicationId !== 'number' ||
    !Number.isSafeInteger(applicationId) ||
    (kind !== 'admin' && kind !== 'decision')
  ) {
    return jsonResponse({ error: 'applicationId og kind er påkrævet' }, 400)
  }

  const { data: application, error: applicationError } = await supabase
    .from('probation_applications')
    .select(
      'id, full_name, status, notification_token, admin_notification_status, decision_notification_status',
    )
    .eq('id', applicationId)
    .single<Application>()
  if (applicationError || !application) {
    return jsonResponse({ error: 'Ikke autoriseret' }, 403)
  }

  const ownsApplication =
    typeof notificationToken === 'string' &&
    notificationToken === application.notification_token
  if (!ownsApplication && !(await callerIsAdmin(supabase, req))) {
    return jsonResponse({ error: 'Ikke autoriseret' }, 403)
  }
  if (
    kind === 'decision' &&
    application.status !== 'approved' &&
    application.status !== 'rejected'
  ) {
    return jsonResponse({ error: 'Ansøgningen er ikke afgjort endnu' }, 409)
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_probation_notification',
    {
      application_id: applicationId,
      notification_kind: kind,
    },
  )
  if (claimError) {
    console.error('Kunne ikke tage notifikationen til levering', claimError)
    return jsonResponse({ error: 'Notifikationen kunne ikke startes' }, 500)
  }
  if (typeof claimed !== 'number' || claimed < 1) {
    const { data: current } = await supabase
      .from('probation_applications')
      .select(
        'admin_notification_status, admin_notification_error, decision_notification_status, decision_notification_error',
      )
      .eq('id', applicationId)
      .single()
    const status =
      kind === 'admin'
        ? current?.admin_notification_status
        : current?.decision_notification_status
    const error =
      kind === 'admin'
        ? current?.admin_notification_error
        : current?.decision_notification_error
    return jsonResponse({
      status,
      skipped: true,
      ...(error ? { error } : {}),
    })
  }

  try {
    const subscriptions =
      kind === 'admin'
        ? await adminSubscriptions(supabase)
        : await applicantSubscriptions(supabase, applicationId)

    if (subscriptions.length === 0) {
      const message =
        kind === 'admin'
          ? 'Ingen administratorer har slået notifikationer til.'
          : 'Ansøgerens push-abonnement findes ikke længere.'
      await completeDelivery(
        supabase,
        applicationId,
        kind,
        claimed,
        false,
        message,
      )
      return jsonResponse({
        status: 'failed',
        sent: 0,
        failed: 0,
        error: message,
      })
    }

    const vapid = await getVapidDetails(supabase)
    const payload = JSON.stringify(payloadFor(application, kind))
    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        const result = await sendPushNotification(subscription, payload, vapid)
        if (result.isGone) {
          const table =
            kind === 'admin'
              ? 'push_subscriptions'
              : 'probation_application_push_subscriptions'
          const key = kind === 'admin' ? 'id' : 'application_id'
          const value =
            kind === 'admin' ? subscription.id : subscription.application_id
          await supabase.from(table).delete().eq(key, value)
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
      } else if (result.value.isGone) {
        removed += 1
      } else if (result.value.status >= 200 && result.value.status < 300) {
        sent += 1
      } else {
        failed += 1
        console.error('Push afvist af tjenesten', result.value.status)
      }
    }

    // Admin-notifikationen er kollektiv: når mindst én aktiv admin-enhed har
    // modtaget den, er klubben varslet. At genforsøge alle enheder på grund af
    // én midlertidig fejl ville vække de vellykkede enheder igen (renotify).
    const succeeded = sent > 0
    const failureMessage = succeeded
      ? null
      : 'Push-tjenesterne modtog ikke notifikationen.'
    await completeDelivery(
      supabase,
      applicationId,
      kind,
      claimed,
      succeeded,
      failureMessage,
    )

    return jsonResponse({
      status: succeeded ? 'sent' : 'failed',
      sent,
      failed,
      removed,
      ...(failureMessage ? { error: failureMessage } : {}),
    })
  } catch (caught) {
    console.error('Notifikationsleveringen fejlede', caught)
    const message = 'Notifikationen kunne ikke leveres. Prøv igen.'
    try {
      await completeDelivery(
        supabase,
        applicationId,
        kind,
        claimed,
        false,
        message,
      )
    } catch (completionError) {
      console.error('Kunne ikke gemme leveringsfejlen', completionError)
    }
    return jsonResponse({ status: 'failed', error: message })
  }
})
