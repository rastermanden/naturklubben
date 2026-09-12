// Den fælles vej for push-notifikationer ud over chatten (#216).
//
// deliverPush tager en type, et emne og en kreds af medlemmer og gør resten:
//   1. sorterer dem fra, der har slået typen fra (notification_preferences),
//   2. sorterer dem fra, der ingen enhed har at sende til,
//   3. tager resten i leveringsloggen med claim_push_deliveries -- kun de
//      medlemmer, der ikke allerede har fået netop denne notifikation om
//      netop dette emne, kommer tilbage,
//   4. sender til de medlemmers enheder og sletter abonnementer, push-
//      tjenesten melder døde.
//
// Rækkefølgen er pointen: claim'en sker *før* sendingen, så et gentaget kald
// -- to klienter, en cron-kørsel, der løber igen -- aldrig sender det samme
// to gange. Prisen er, at et push, der fejler hos push-tjenesten, ikke
// forsøges igen; hellere en notifikation, der mangler, end den samme to gange.
//
// Næste type (#222, ventelisten) bygger sin payload, udvider kind-constrainten
// på notification_preferences og push_deliveries i sin egen migration og kalder
// herind.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3'
import type { NotificationKind, PushPayload } from './pushPayloads.ts'
import {
  selectPushRecipients,
  subscriptionsFor,
  type PushSubscriptionRow,
} from './pushRecipients.ts'
import { sendPushNotification, type VapidDetails } from './webpush.ts'

export interface DeliveryResult {
  /** Enheder, push-tjenesten tog imod notifikationen for. */
  sent: number
  /** Enheder, hvor sendingen fejlede. */
  failed: number
  /** Abonnementer, push-tjenesten meldte døde -- de er slettet. */
  removed: number
  /** Medlemmer, der ikke fik noget: fravalgt, ingen enhed, eller allerede sendt. */
  skipped: number
}

export function emptyDeliveryResult(): DeliveryResult {
  return { sent: 0, failed: 0, removed: 0, skipped: 0 }
}

export async function deliverPush({
  supabase,
  vapid,
  kind,
  subjectId,
  userIds,
  payload,
}: {
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>
  vapid: VapidDetails
  kind: NotificationKind
  subjectId: string
  userIds: readonly string[]
  payload: PushPayload
}): Promise<DeliveryResult> {
  const candidates = [...new Set(userIds)]
  if (candidates.length === 0) return emptyDeliveryResult()

  const { data: preferenceRows, error: preferencesError } = await supabase
    .from('notification_preferences')
    .select('user_id, enabled')
    .eq('kind', kind)
    .in('user_id', candidates)
  if (preferencesError) throw preferencesError

  const preferences = new Map<string, boolean>()
  for (const row of preferenceRows ?? []) {
    preferences.set(row.user_id as string, row.enabled !== false)
  }

  const { data: subscriptionRows, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', candidates)
  if (subscriptionsError) throw subscriptionsError
  const subscriptions = (subscriptionRows ?? []) as PushSubscriptionRow[]

  const recipients = selectPushRecipients({
    userIds: candidates,
    preferences,
    subscriptions,
  })
  if (recipients.length === 0) {
    return { ...emptyDeliveryResult(), skipped: candidates.length }
  }

  const { data: claimedRows, error: claimError } = await supabase.rpc(
    'claim_push_deliveries',
    { p_kind: kind, p_subject_id: subjectId, p_user_ids: recipients },
  )
  if (claimError) throw claimError
  const claimed = ((claimedRows ?? []) as unknown[]).map((row) =>
    // PostgREST leverer `setof uuid` som en liste af strenge; er det en
    // objektform, tages første værdi.
    typeof row === 'string' ? row : String(Object.values(row as object)[0]),
  )

  const targets = subscriptionsFor(claimed, subscriptions)
  const body = JSON.stringify(payload)

  const results = await Promise.allSettled(
    targets.map(async (subscription) => {
      const result = await sendPushNotification(subscription, body, vapid)
      if (result.isGone) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', subscription.id)
      }
      return result
    }),
  )

  const total: DeliveryResult = {
    ...emptyDeliveryResult(),
    skipped: candidates.length - claimed.length,
  }
  for (const result of results) {
    if (result.status === 'rejected') {
      total.failed += 1
      console.error(`Push (${kind}) fejlede`, result.reason)
      continue
    }
    if (result.value.isGone) {
      total.removed += 1
    } else if (result.value.status >= 200 && result.value.status < 300) {
      total.sent += 1
    } else {
      total.failed += 1
      console.error(`Push (${kind}) afvist af tjenesten`, result.value.status)
    }
  }
  return total
}
