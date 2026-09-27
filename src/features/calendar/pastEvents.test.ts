import { describe, expect, it } from 'vitest'
import { isPastEvent, pastRangeOfMonth } from './pastEvents'

const now = new Date(2026, 8, 27, 14, 30)

describe('isPastEvent', () => {
  it('regner en begivenhed før i dag som tidligere', () => {
    expect(
      isPastEvent(
        { start_at: new Date(2026, 8, 26, 23, 59).toISOString(), end_at: null },
        now,
      ),
    ).toBe(true)
  })

  it('regner en begivenhed tidligere i dag som kommende', () => {
    expect(
      isPastEvent(
        { start_at: new Date(2026, 8, 27, 8, 0).toISOString(), end_at: null },
        now,
      ),
    ).toBe(false)
  })

  it('regner en fremtidig begivenhed som kommende', () => {
    expect(
      isPastEvent(
        { start_at: new Date(2026, 9, 3, 10, 0).toISOString(), end_at: null },
        now,
      ),
    ).toBe(false)
  })
})

describe('isPastEvent for flerdagsbegivenheder (#259)', () => {
  it('regner en tur, der startede i går og slutter i morgen, som kommende', () => {
    expect(
      isPastEvent(
        {
          start_at: new Date(2026, 8, 26, 16, 0).toISOString(),
          end_at: new Date(2026, 8, 28, 14, 0).toISOString(),
        },
        now,
      ),
    ).toBe(false)
  })

  it('regner en tur, der sluttede i går, som tidligere', () => {
    expect(
      isPastEvent(
        {
          start_at: new Date(2026, 8, 24, 16, 0).toISOString(),
          end_at: new Date(2026, 8, 26, 14, 0).toISOString(),
        },
        now,
      ),
    ).toBe(true)
  })

  it('regner en aften, der slutter ved midnat i nat, som afholdt', () => {
    expect(
      isPastEvent(
        {
          start_at: new Date(2026, 8, 26, 18, 0).toISOString(),
          end_at: new Date(2026, 8, 27, 0, 0).toISOString(),
        },
        now,
      ),
    ).toBe(true)
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
