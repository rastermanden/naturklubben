import { describe, expect, it } from 'vitest'
import { isPastEvent, monthRange, pastRangeOfMonth, startOfDay } from './pastEvents'

const now = new Date(2026, 8, 27, 14, 30)

function at(year: number, month: number, day: number, hour = 0) {
  return new Date(year, month, day, hour).getTime()
}

describe('isPastEvent', () => {
  it('regner en begivenhed før i dag som tidligere', () => {
    expect(
      isPastEvent({ startAt: at(2026, 8, 26, 23), endAt: null }, now),
    ).toBe(true)
  })

  it('regner en begivenhed tidligere i dag som kommende', () => {
    expect(isPastEvent({ startAt: at(2026, 8, 27, 8), endAt: null }, now)).toBe(
      false,
    )
  })

  it('regner en tur, der startede i går og slutter i morgen, som kommende', () => {
    expect(
      isPastEvent(
        { startAt: at(2026, 8, 26, 16), endAt: at(2026, 8, 28, 14) },
        now,
      ),
    ).toBe(false)
  })

  it('regner en aften, der slutter ved midnat i nat, som afholdt', () => {
    expect(
      isPastEvent(
        { startAt: at(2026, 8, 26, 18), endAt: at(2026, 8, 27, 0) },
        now,
      ),
    ).toBe(true)
  })
})

describe('pastRangeOfMonth og monthRange', () => {
  it('dækker hele en tidligere måned', () => {
    expect(pastRangeOfMonth(new Date(2026, 6, 1), now)).toEqual({
      from: at(2026, 6, 1),
      to: at(2026, 7, 1),
    })
  })

  it('stopper ved midnat i dag i den nuværende måned', () => {
    expect(pastRangeOfMonth(new Date(2026, 8, 1), now)).toEqual({
      from: at(2026, 8, 1),
      to: at(2026, 8, 27),
    })
  })

  it('er null for en måned efter i dag', () => {
    expect(pastRangeOfMonth(new Date(2026, 9, 1), now)).toBeNull()
  })

  it('giver hele måneden til månedsvisningen', () => {
    expect(monthRange(new Date(2026, 8, 27))).toEqual({
      from: at(2026, 8, 1),
      to: at(2026, 9, 1),
    })
  })

  it('regner midnat som lokal tid', () => {
    expect(startOfDay(now)).toBe(at(2026, 8, 27))
  })
})
