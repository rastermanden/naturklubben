// Enhedstests for notifikationsteksterne ud over chatten (#216). Kør med
// `deno test --config supabase/deno.json supabase/functions/_shared/*.test.ts`.

import { strict as assert } from 'node:assert'
import {
  badgeNominationAdminPayload,
  badgeNominationNomineePayload,
  eventCreatedPayload,
  eventReminderPayload,
  eventTag,
  formatEventStart,
  relativeDay,
} from './pushPayloads.ts'

const EVENT = {
  id: '00000000-0000-0000-0000-0000000000e1',
  title: 'Svampetur i Rude Skov',
  // 10:00 dansk sommertid.
  start_at: '2026-09-14T08:00:00.000Z',
  location: 'P-pladsen ved Rudersdal',
}

Deno.test('formatEventStart: dato og klokkeslæt i dansk tid', () => {
  const text = formatEventStart(EVENT.start_at)
  assert.match(text, /mandag/)
  assert.match(text, /14\. september/)
  assert.match(text, /kl\. 10[.:]00/)
})

Deno.test('relativeDay: "i morgen" set fra aftenen før', () => {
  const now = new Date('2026-09-13T15:30:00.000Z') // 17:30 dansk tid
  assert.equal(relativeDay(EVENT.start_at, now), 'i morgen')
})

Deno.test('relativeDay: "i dag" set fra samme morgen', () => {
  const now = new Date('2026-09-14T05:00:00.000Z') // 07:00 dansk tid
  assert.equal(relativeDay(EVENT.start_at, now), 'i dag')
})

Deno.test('relativeDay: dagsgrænsen følger dansk tid, ikke UTC', () => {
  // 23:30 den 13. i Danmark er 21:30 UTC -- stadig "i morgen".
  const now = new Date('2026-09-13T21:30:00.000Z')
  assert.equal(relativeDay(EVENT.start_at, now), 'i morgen')
})

Deno.test('relativeDay: længere ude gives datoen', () => {
  const now = new Date('2026-09-10T10:00:00.000Z')
  assert.match(relativeDay(EVENT.start_at, now), /14\. september/)
})

Deno.test('eventCreatedPayload: opretterens navn, titel, tid og sted', () => {
  const payload = eventCreatedPayload({ event: EVENT, creatorName: ' Ida ' })
  assert.equal(payload.title, 'Ida har oprettet en begivenhed')
  assert.match(payload.body, /^Svampetur i Rude Skov · mandag/)
  assert.match(payload.body, /· P-pladsen ved Rudersdal$/)
  assert.equal(payload.tag, eventTag(EVENT.id))
  assert.equal(payload.path, `kalender/${EVENT.id}`)
})

Deno.test('eventCreatedPayload: uden navn og sted', () => {
  const payload = eventCreatedPayload({
    event: { ...EVENT, location: null },
    creatorName: null,
  })
  assert.equal(payload.title, 'Ny begivenhed i kalenderen')
  assert.doesNotMatch(payload.body, /P-pladsen/)
  assert.doesNotMatch(payload.body, /·\s*$/)
})

Deno.test('eventCreatedPayload: en lang titel forkortes', () => {
  const payload = eventCreatedPayload({
    event: { ...EVENT, title: 'x'.repeat(200) },
    creatorName: null,
  })
  assert.ok(payload.body.startsWith(`${'x'.repeat(79)}…`))
})

Deno.test('eventReminderPayload: "i morgen" med klokkeslæt og sted', () => {
  const payload = eventReminderPayload({
    event: EVENT,
    now: new Date('2026-09-13T15:30:00.000Z'),
  })
  assert.equal(payload.title, 'Husk: Svampetur i Rude Skov')
  assert.match(payload.body, /^Du er tilmeldt i morgen kl\. 10[.:]00/)
  assert.match(payload.body, /P-pladsen ved Rudersdal\.$/)
  assert.equal(payload.path, `kalender/${EVENT.id}`)
})

Deno.test('eventReminderPayload: deler tag med "ny begivenhed"', () => {
  const created = eventCreatedPayload({ event: EVENT, creatorName: null })
  const reminder = eventReminderPayload({ event: EVENT })
  assert.equal(created.tag, reminder.tag)
})

const NOMINATION = {
  id: '00000000-0000-0000-0000-0000000000b1',
  badgeName: 'Svampekender',
  nomineeName: 'Jens',
  nominatorName: 'Ida',
}

Deno.test('badgeNominationAdminPayload: hvem indstillede hvem til hvad', () => {
  const payload = badgeNominationAdminPayload(NOMINATION)
  assert.equal(payload.title, 'Ny indstilling til en badge')
  assert.equal(payload.body, 'Ida har indstillet Jens til Svampekender.')
  assert.equal(payload.path, 'admin?sektion=badges')
})

Deno.test(
  'badgeNominationAdminPayload: manglende navne får standardtekst',
  () => {
    const payload = badgeNominationAdminPayload({
      ...NOMINATION,
      badgeName: null,
      nomineeName: '  ',
      nominatorName: undefined,
    })
    assert.equal(
      payload.body,
      'Et medlem har indstillet Et medlem til en badge.',
    )
  },
)

Deno.test(
  'badgeNominationNomineePayload: røber ikke, hvem der indstillede',
  () => {
    const payload = badgeNominationNomineePayload(NOMINATION)
    assert.equal(payload.title, 'Du er indstillet til en badge')
    assert.doesNotMatch(payload.body, /Ida/)
    assert.match(payload.body, /Svampekender/)
    assert.equal(payload.path, 'profil')
    assert.notEqual(payload.tag, badgeNominationAdminPayload(NOMINATION).tag)
  },
)
