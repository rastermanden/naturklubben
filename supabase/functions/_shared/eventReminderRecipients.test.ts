// Enhedstests for hvem påmindelsen dagen før går til (#216, #222). Kør med
// `deno test --config supabase/deno.json supabase/functions/_shared/*.test.ts`.

import { strict as assert } from 'node:assert'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3'
import { loadEventReminderRecipients } from './eventReminderRecipients.ts'

interface Row {
  event_id: string
  user_id: string
  status: 'attending' | 'waitlisted' | 'declined'
}

type Result =
  { data: Row[]; error: null } | { data: null; error: { message: string } }

// deno-lint-ignore no-explicit-any
type Client = SupabaseClient<any, any, any>

/** Filtrerer som PostgREST: hvert `eq` snævrer rækkerne ind. */
function filter(remaining: Row[]) {
  return Object.assign(
    Promise.resolve<Result>({ data: remaining, error: null }),
    {
      eq: (column: keyof Row, value: string) =>
        filter(remaining.filter((row) => row[column] === value)),
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
    },
  )
  return { from: () => ({ select: () => failed }) } as unknown as Client
}

const SKOVTUR = 'skovtur'
const SVAMPETUR = 'svampetur'

Deno.test(
  'loadEventReminderRecipients: kun de tilmeldte får påmindelsen',
  async () => {
    const recipients = await loadEventReminderRecipients(
      fakeClient([
        { event_id: SKOVTUR, user_id: 'alice', status: 'attending' },
        { event_id: SKOVTUR, user_id: 'bob', status: 'declined' },
        { event_id: SKOVTUR, user_id: 'carol', status: 'waitlisted' },
        { event_id: SKOVTUR, user_id: 'dave', status: 'attending' },
      ]),
      SKOVTUR,
    )
    assert.deepEqual(recipients, ['alice', 'dave'])
  },
)

Deno.test('loadEventReminderRecipients: kun den ene begivenhed', async () => {
  const recipients = await loadEventReminderRecipients(
    fakeClient([
      { event_id: SKOVTUR, user_id: 'alice', status: 'attending' },
      { event_id: SVAMPETUR, user_id: 'erik', status: 'attending' },
    ]),
    SKOVTUR,
  )
  assert.deepEqual(recipients, ['alice'])
})

Deno.test(
  'loadEventReminderRecipients: ingen tilmeldte giver en tom liste',
  async () => {
    const recipients = await loadEventReminderRecipients(
      fakeClient([{ event_id: SKOVTUR, user_id: 'bob', status: 'declined' }]),
      SKOVTUR,
    )
    assert.deepEqual(recipients, [])
  },
)

Deno.test(
  'loadEventReminderRecipients: en databasefejl standser sendingen',
  async () => {
    await assert.rejects(
      () =>
        loadEventReminderRecipients(
          failingClient('connection refused'),
          SKOVTUR,
        ),
      { message: 'connection refused' },
    )
  },
)
