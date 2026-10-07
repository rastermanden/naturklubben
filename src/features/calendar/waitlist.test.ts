import { describe, expect, it } from 'vitest'
import {
  attendingEntries,
  capRaised,
  expectedResponseStatus,
  hasFreeSeat,
  seatsLabel,
  waitlistEntries,
  waitlistPosition,
  type AttendanceEntry,
} from './waitlist'

const entries: AttendanceEntry[] = [
  { user_id: 'dave', status: 'waitlisted', created_at: '2026-09-01T10:02:00Z' },
  { user_id: 'alice', status: 'attending', created_at: '2026-09-01T10:00:00Z' },
  {
    user_id: 'carol',
    status: 'waitlisted',
    created_at: '2026-09-01T10:01:00Z',
  },
  { user_id: 'bob', status: 'attending', created_at: '2026-09-01T10:00:30Z' },
  { user_id: 'erik', status: 'declined', created_at: '2026-09-01T10:03:00Z' },
]

describe('waitlist', () => {
  it('sorterer ventelisten i tilmeldingsrækkefølge', () => {
    expect(waitlistEntries(entries).map((entry) => entry.user_id)).toEqual([
      'carol',
      'dave',
    ])
  })

  it('bryder et sammenfald i tidspunkt på user_id, som databasen gør', () => {
    const sameMoment: AttendanceEntry[] = [
      {
        user_id: 'b',
        status: 'waitlisted',
        created_at: '2026-09-01T10:00:00Z',
      },
      {
        user_id: 'a',
        status: 'waitlisted',
        created_at: '2026-09-01T10:00:00Z',
      },
    ]
    expect(waitlistEntries(sameMoment).map((entry) => entry.user_id)).toEqual([
      'a',
      'b',
    ])
  })

  it('kender medlemmets plads i køen', () => {
    expect(waitlistPosition(entries, 'carol')).toBe(1)
    expect(waitlistPosition(entries, 'dave')).toBe(2)
    expect(waitlistPosition(entries, 'alice')).toBeNull()
    expect(waitlistPosition(entries, 'ukendt')).toBeNull()
  })

  it('tæller kun deltagere mod loftet', () => {
    expect(attendingEntries(entries)).toHaveLength(2)
    expect(hasFreeSeat(entries, 2)).toBe(false)
    expect(hasFreeSeat(entries, 3)).toBe(true)
    expect(hasFreeSeat(entries, null)).toBe(true)
  })

  it('giver ledige pladser til ventelisten før en ny tilmelding', () => {
    expect(expectedResponseStatus(entries, 3)).toBe('waitlisted')
    expect(expectedResponseStatus(entries, 2)).toBe('waitlisted')
    const noQueue = entries.filter((entry) => entry.status !== 'waitlisted')
    expect(expectedResponseStatus(noQueue, 3)).toBe('attending')
    expect(expectedResponseStatus(noQueue, 2)).toBe('waitlisted')
    expect(expectedResponseStatus(noQueue, null)).toBe('attending')
  })

  it('viser "x/y pladser" med loft og bare tallet uden', () => {
    expect(seatsLabel(entries, 10)).toBe('2/10 pladser')
    expect(seatsLabel(entries, null)).toBe('2')
  })

  it('ved, hvornår et ændret loft giver plads til flere', () => {
    expect(capRaised(2, 3)).toBe(true)
    expect(capRaised(2, null)).toBe(true)
    expect(capRaised(3, 2)).toBe(false)
    expect(capRaised(2, 2)).toBe(false)
    expect(capRaised(null, 5)).toBe(false)
    expect(capRaised(null, null)).toBe(false)
  })
})
