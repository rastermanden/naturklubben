// Enhedstests for udvælgelsen af modtagere ud over chatten (#216). Kør med
// `deno test --config supabase/deno.json supabase/functions/_shared/*.test.ts`.

import { strict as assert } from 'node:assert'
import {
  parseClaimedUserIds,
  selectPushRecipients,
  subscriptionsFor,
} from './pushRecipients.ts'

function subscription(id: string, userId: string) {
  return {
    id,
    user_id: userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: 'p256dh',
    auth: 'auth',
  }
}

const IDA = 'ida'
const JENS = 'jens'
const KAREN = 'karen'

const SUBSCRIPTIONS = [
  subscription('ida-telefon', IDA),
  subscription('ida-computer', IDA),
  subscription('jens-telefon', JENS),
]

Deno.test('selectPushRecipients: ingen præference betyder ja tak', () => {
  const recipients = selectPushRecipients({
    userIds: [IDA, JENS],
    preferences: new Map(),
    subscriptions: SUBSCRIPTIONS,
  })
  assert.deepEqual(recipients, [IDA, JENS])
})

Deno.test('selectPushRecipients: et fravalg respekteres', () => {
  const recipients = selectPushRecipients({
    userIds: [IDA, JENS],
    preferences: new Map([[JENS, false]]),
    subscriptions: SUBSCRIPTIONS,
  })
  assert.deepEqual(recipients, [IDA])
})

Deno.test('selectPushRecipients: et eksplicit tilvalg tæller som ja', () => {
  const recipients = selectPushRecipients({
    userIds: [JENS],
    preferences: new Map([[JENS, true]]),
    subscriptions: SUBSCRIPTIONS,
  })
  assert.deepEqual(recipients, [JENS])
})

Deno.test('selectPushRecipients: uden enhed er der ingen at sende til', () => {
  // Karen står ikke i loggen bagefter -- slår hun notifikationer til i
  // morgen, kan hun stadig få den næste påmindelse.
  const recipients = selectPushRecipients({
    userIds: [IDA, KAREN],
    preferences: new Map(),
    subscriptions: SUBSCRIPTIONS,
  })
  assert.deepEqual(recipients, [IDA])
})

Deno.test('selectPushRecipients: et medlem tælles én gang', () => {
  const recipients = selectPushRecipients({
    userIds: [IDA, IDA, JENS],
    preferences: new Map(),
    subscriptions: SUBSCRIPTIONS,
  })
  assert.deepEqual(recipients, [IDA, JENS])
})

Deno.test('subscriptionsFor: alle enheder for netop de claimede', () => {
  const targets = subscriptionsFor([IDA], SUBSCRIPTIONS)
  assert.deepEqual(
    targets.map((row) => row.id),
    ['ida-telefon', 'ida-computer'],
  )
})

Deno.test('subscriptionsFor: ingen claimede, ingen enheder', () => {
  assert.deepEqual(subscriptionsFor([], SUBSCRIPTIONS), [])
})

Deno.test('parseClaimedUserIds: PostgREST-listen af uuid-strenge', () => {
  assert.deepEqual(parseClaimedUserIds([IDA, JENS]), [IDA, JENS])
  assert.deepEqual(parseClaimedUserIds([]), [])
})

Deno.test('parseClaimedUserIds: en anden form standser sendingen', () => {
  assert.throws(
    () => parseClaimedUserIds([{ claim_push_deliveries: IDA }]),
    /uuid-strenge/,
  )
  assert.throws(() => parseClaimedUserIds({ user_id: IDA }), /liste/)
  assert.throws(() => parseClaimedUserIds(null), /liste/)
})
