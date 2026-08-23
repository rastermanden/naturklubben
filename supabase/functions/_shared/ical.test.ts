import { strict as assert } from 'node:assert'
import { generateIcal, type IcalEvent } from './ical.ts'

const event: IcalEvent = {
  id: 'event-1',
  title: 'Tur, bål; hygge',
  description: 'Linje 1\nLinje 2\\slut',
  location: 'Skov, sø',
  start_at: '2026-09-05T18:30:00+02:00',
  end_at: '2026-09-05T20:00:00+02:00',
}

Deno.test('generateIcal: feed metadata kan tilføjes af calendar-feed', () => {
  const calendar = generateIcal([event], 'Naturklubben', {
    refreshInterval: 'PT1H',
  })

  assert.match(calendar, /\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n/)
  assert.match(calendar, /\r\nX-PUBLISHED-TTL:PT1H\r\n/)
  assert.match(calendar, /\r\nDTSTART:20260905T163000Z\r\n/)
  assert.match(calendar, /\r\nDTEND:20260905T180000Z\r\n/)
})

Deno.test('generateIcal: browserkalendere får ikke feed metadata', () => {
  const calendar = generateIcal([event])

  assert.doesNotMatch(calendar, /REFRESH-INTERVAL/)
  assert.doesNotMatch(calendar, /X-PUBLISHED-TTL/)
})
