import { describe, expect, it } from 'vitest'
import { isPastEvent, pastRangeOfMonth } from './pastEvents'

const now = new Date(2026, 8, 27, 14, 30)

describe('isPastEvent', () => {
  it('regner en begivenhed før i dag som tidligere', () => {
    expect(
      isPastEvent(
        { start_at: new Date(2026, 8, 26, 23, 59).toISOString() },
        now,
      ),
    ).toBe(true)
  })

  it('regner en begivenhed tidligere i dag som kommende', () => {
    expect(
      isPastEvent({ start_at: new Date(2026, 8, 27, 8, 0).toISOString() }, now),
    ).toBe(false)
  })

  it('regner en fremtidig begivenhed som kommende', () => {
    expect(
      isPastEvent({ start_at: new Date(2026, 9, 3, 10, 0).toISOString() }, now),
    ).toBe(false)
  })
})

describe('pastRangeOfMonth', () => {
  it('dækker hele en tidligere måned', () => {
    expect(pastRangeOfMonth(new Date(2026, 6, 1), now)).toEqual({
      from: new Date(2026, 6, 1),
      to: new Date(2026, 7, 1),
    })
  })

  it('stopper ved midnat i dag i den nuværende måned', () => {
    expect(pastRangeOfMonth(new Date(2026, 8, 1), now)).toEqual({
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 27),
    })
  })

  it('er null for en måned efter i dag', () => {
    expect(pastRangeOfMonth(new Date(2026, 9, 1), now)).toBeNull()
  })

  it('er null for den nuværende måned på dens første dag', () => {
    expect(
      pastRangeOfMonth(new Date(2026, 8, 1), new Date(2026, 8, 1, 9)),
    ).toBeNull()
  })
})
