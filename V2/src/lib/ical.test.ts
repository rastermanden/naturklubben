import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateIcal, type IcalEvent } from './ical'

const event: IcalEvent = {
  id: 'event-1',
  title: 'Tur, bål; hygge',
  description: 'Linje 1\nLinje 2\\slut',
  location: 'Skov, sø',
  startAt: Date.parse('2026-09-05T18:30:00+02:00'),
  endAt: Date.parse('2026-09-05T20:00:00+02:00'),
}

afterEach(() => {
  vi.useRealTimers()
})

describe('generateIcal', () => {
  it('skriver kalenderdata i UTC med escapet tekst', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'))

    const calendar = generateIcal([event], 'Natur, venner')

    expect(calendar).toContain('X-WR-CALNAME:Natur\\, venner')
    expect(calendar).not.toContain('REFRESH-INTERVAL')
    expect(calendar).not.toContain('X-PUBLISHED-TTL')
    expect(calendar).toContain('UID:event-1@naturklubben')
    expect(calendar).toContain('DTSTAMP:20260823T100000Z')
    expect(calendar).toContain('DTSTART:20260905T163000Z')
    expect(calendar).toContain('DTEND:20260905T180000Z')
    expect(calendar).toContain('SUMMARY:Tur\\, bål\\; hygge')
    expect(calendar).toContain('DESCRIPTION:Linje 1\\nLinje 2\\\\slut')
    expect(calendar).toContain('LOCATION:Skov\\, sø')
  })

  it('fold lange Unicode-linjer uden at overskride 75 oktetter', () => {
    const title = 'Å'.repeat(50)
    const calendar = generateIcal([{ ...event, title }])

    for (const line of calendar.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }

    expect(calendar.replaceAll('\r\n ', '')).toContain(`SUMMARY:${title}`)
  })

  it('kan sætte feed-metadata og slutter altid med END:VCALENDAR', () => {
    const calendar = generateIcal([event], 'Naturklubben', {
      refreshInterval: 'PT1H',
    })

    expect(calendar).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    expect(calendar).toContain('X-PUBLISHED-TTL:PT1H')
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('udelader DTEND når begivenheden ikke har et sluttidspunkt', () => {
    const calendar = generateIcal([{ ...event, endAt: null }])

    expect(calendar).not.toContain('DTEND')
    expect(calendar).toContain('DTSTART:20260905T163000Z')
  })
})
