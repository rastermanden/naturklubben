// Enhedstests for hvem der reelt kan meldes som rykket op fra ventelisten
// (#236). Kør med
// `deno test --config supabase/deno.json supabase/functions/_shared/*.test.ts`.

import { strict as assert } from 'node:assert'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3'
import { loadWaitlistPromotionRecipients } from './waitlistPromotionRecipients.ts'

interface Row {
  event_id: string
  user_id: string
  status: 'attending' | 'waitlisted' | 'declined'
}

type Result =
  { data: Row[]; error: null } | { data: null; error: { message: string } }

// deno-lint-ignore no-explicit-any
type Client = SupabaseClient<any, any, any>

/** Filtrerer som PostgREST: hvert `eq`/`in` snævrer rækkerne ind. */
function filter(remaining: Row[]) {
  return Object.assign(
    Promise.resolve<Result>({ data: remaining, error: null }),
    {
      eq: (column: keyof Row, value: string) =>
        filter(remaining.filter((row) => row[column] === value)),
      in: (column: keyof Row, values: readonly string[]) =>
        filter(remaining.filter((row) => values.includes(row[column]))),
    },
  )
}

function fakeClient(rows: Row[]): Client {
  return {
    from: () => ({ select: () => filter(rows) }),
  } as unknown as Client
}

function failingClient(message: string): Client {
  const failed = Object.assign(
    Promise.resolve<Result>({ data: null, error: { message } }),
    {
      eq: () => failed,
      in: () => failed,
    },
  )
  return { from: () => ({ select: () => failed }) } as unknown as Client
}

const SKOVTUR = 'skovtur'
const SVAMPETUR = 'svampetur'

Deno.test(
  'loadWaitlistPromotionRecipients: kun de faktisk tilmeldte af kandidaterne',
  async () => {
    const recipients = await loadWaitlistPromotionRecipients(
      fakeClient([
        { event_id: SKOVTUR, user_id: 'alice', status: 'attending' },
        { event_id: SKOVTUR, user_id: 'bob', status: 'waitlisted' },
        { event_id: SKOVTUR, user_id: 'carol', status: 'declined' },
        { event_id: SKOVTUR, user_id: 'dave', status: 'attending' },
      ]),
      SKOVTUR,
      ['alice', 'bob', 'carol', 'eve'],
    )
    assert.deepEqual(recipients, ['alice'])
  },
)

Deno.test(
  'loadWaitlistPromotionRecipients: ingen kandidater giver en tom liste uden opslag',
  async () => {
    const recipients = await loadWaitlistPromotionRecipients(
      failingClient('skal ikke kaldes'),
      SKOVTUR,
      [],
    )
    assert.deepEqual(recipients, [])
  },
)

Deno.test(
  'loadWaitlistPromotionRecipients: kun den ene begivenhed',
  async () => {
    const recipients = await loadWaitlistPromotionRecipients(
      fakeClient([
        { event_id: SKOVTUR, user_id: 'alice', status: 'attending' },
        { event_id: SVAMPETUR, user_id: 'alice', status: 'attending' },
      ]),
      SKOVTUR,
      ['alice'],
    )
    assert.deepEqual(recipients, ['alice'])
  },
)

Deno.test(
  'loadWaitlistPromotionRecipients: en påstået id, der ikke deltager, springes over',
  async () => {
    const recipients = await loadWaitlistPromotionRecipients(
      fakeClient([{ event_id: SKOVTUR, user_id: 'bob', status: 'declined' }]),
      SKOVTUR,
      ['bob'],
    )
    assert.deepEqual(recipients, [])
  },
)

Deno.test(
  'loadWaitlistPromotionRecipients: dubletter i kandidatlisten tælles kun én gang',
  async () => {
    const recipients = await loadWaitlistPromotionRecipients(
      fakeClient([
        { event_id: SKOVTUR, user_id: 'alice', status: 'attending' },
      ]),
      SKOVTUR,
      ['alice', 'alice'],
    )
    assert.deepEqual(recipients, ['alice'])
  },
)

Deno.test(
  'loadWaitlistPromotionRecipients: en databasefejl standser sendingen',
  async () => {
    await assert.rejects(
      () =>
        loadWaitlistPromotionRecipients(
          failingClient('connection refused'),
          SKOVTUR,
          ['alice'],
        ),
      { message: 'connection refused' },
    )
  },
)
