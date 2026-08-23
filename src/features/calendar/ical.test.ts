import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from './useEvents'
import { generateIcal } from './ical'

const event: CalendarEvent = {
  id: 'event-1',
  title: 'Tur, bål; hygge',
  description: 'Linje 1\nLinje 2\\slut',
  location: 'Skov, sø',
  start_at: '2026-09-05T18:30:00+02:00',
  end_at: '2026-09-05T20:00:00+02:00',
  created_by: 'member-id',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('generateIcal', () => {
  it('exports calendar data in UTC with escaped text', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'))

    const calendar = generateIcal([event], 'Natur, venner')

    expect(calendar).toContain('X-WR-CALNAME:Natur\\, venner')
    expect(calendar).toContain('UID:event-1@naturklubben')
    expect(calendar).toContain('DTSTAMP:20260823T100000Z')
    expect(calendar).toContain('DTSTART:20260905T163000Z')
    expect(calendar).toContain('DTEND:20260905T180000Z')
    expect(calendar).toContain('SUMMARY:Tur\\, bål\\; hygge')
    expect(calendar).toContain('DESCRIPTION:Linje 1\\nLinje 2\\\\slut')
    expect(calendar).toContain('LOCATION:Skov\\, sø')
  })

  it('folds long Unicode lines without exceeding 75 UTF-8 octets', () => {
    const title = 'Å'.repeat(50)
    const calendar = generateIcal([{ ...event, title }])

    for (const line of calendar.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }

    expect(calendar.replaceAll('\r\n ', '')).toContain(`SUMMARY:${title}`)
  })
})
