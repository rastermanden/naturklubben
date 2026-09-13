import { strict as assert } from 'node:assert'
import { formatEventTime, guestDecisionEmail } from './guestDecisionEmail.ts'

const event = {
  title: 'Åben skovtur',
  location: 'P-pladsen ved Rude Skov',
  start_at: '2026-10-03T08:00:00Z',
  end_at: '2026-10-03T11:00:00Z',
}

Deno.test('gæstesvar: tidspunktet skrives i dansk tid', () => {
  assert.equal(
    formatEventTime(event),
    'lørdag den 3. oktober 2026 kl. 10.00–13.00',
  )
  assert.equal(
    formatEventTime({ ...event, end_at: null }),
    'lørdag den 3. oktober 2026 kl. 10.00',
  )
})

Deno.test('gæstesvar: godkendelse nævner tid, sted og antal', () => {
  const mail = guestDecisionEmail({
    status: 'approved',
    fullName: 'Gitte Gæst',
    partySize: 2,
    event,
  })

  assert.equal(mail.subject, 'Du er velkommen til "Åben skovtur"')
  assert.match(mail.text, /^Hej Gitte\n/)
  assert.match(mail.text, /godkendt/)
  assert.match(
    mail.text,
    /Tidspunkt: lørdag den 3\. oktober 2026 kl\. 10\.00–13\.00/,
  )
  assert.match(mail.text, /Sted: P-pladsen ved Rude Skov/)
  assert.match(mail.text, /Antal personer: 2/)
})

Deno.test('gæstesvar: afvisning er venlig og uden sted/antal', () => {
  const mail = guestDecisionEmail({
    status: 'rejected',
    fullName: 'Gitte',
    partySize: 1,
    event: { ...event, location: null },
  })

  assert.equal(mail.subject, 'Svar på din ansøgning til "Åben skovtur"')
  assert.match(
    mail.text,
    /Vi kan desværre ikke tage imod din ansøgning denne gang\./,
  )
  assert.doesNotMatch(mail.text, /flere deltagere/)
  assert.doesNotMatch(mail.text, /Sted:/)
  assert.doesNotMatch(mail.text, /Antal personer/)
})
