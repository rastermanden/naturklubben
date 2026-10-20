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

function entry(
  profileId: string,
  status: AttendanceEntry['status'],
  seconds: number,
): AttendanceEntry {
  return { profileId, status, queuedAt: Date.parse('2026-09-01T10:00:00Z') + seconds * 1000 }
}

const entries: AttendanceEntry[] = [
  entry('dave', 'waitlisted', 120),
  entry('alice', 'attending', 0),
  entry('carol', 'waitlisted', 60),
  entry('bob', 'attending', 30),
  entry('erik', 'declined', 180),
]

describe('waitlist', () => {
  it('sorterer ventelisten i tilmeldingsrækkefølge', () => {
    expect(waitlistEntries(entries).map((row) => row.profileId)).toEqual([
      'carol',
      'dave',
    ])
  })

  it('bryder et sammenfald i tidspunkt på profil-id, som serveren gør', () => {
    const sameMoment = [entry('b', 'waitlisted', 0), entry('a', 'waitlisted', 0)]
    expect(waitlistEntries(sameMoment).map((row) => row.profileId)).toEqual([
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
    const noQueue = entries.filter((row) => row.status !== 'waitlisted')
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
