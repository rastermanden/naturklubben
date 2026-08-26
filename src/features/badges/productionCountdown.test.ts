import { describe, expect, it } from 'vitest'
import { compareProductions, productionDeadline } from './productionCountdown'
import type { BadgeProduction } from './types'

const now = new Date('2026-08-26T12:00:00Z').getTime()

function production(overrides: Partial<BadgeProduction>): BadgeProduction {
  return {
    id: 'p1',
    member_badge_id: 'm1',
    due_at: '2026-08-27T12:00:00Z',
    claimed_by: null,
    claimed_at: null,
    status: 'pending',
    completed_at: null,
    created_at: '2026-08-26T12:00:00Z',
    member_badges: {
      id: 'm1',
      profile_id: 'u1',
      awarded_at: '2026-08-26T12:00:00Z',
      badges: {} as BadgeProduction['member_badges']['badges'],
    },
    ...overrides,
  }
}

describe('productionDeadline', () => {
  it('viser tiden tilbage af de 24 timer', () => {
    const deadline = productionDeadline(
      production({ due_at: '2026-08-26T15:12:00Z' }),
      now,
    )

    expect(deadline.overdue).toBe(false)
    expect(deadline.label).toBe('3 t 12 min tilbage')
  })

  it('markerer en overskredet opgave', () => {
    const deadline = productionDeadline(
      production({ due_at: '2026-08-26T10:30:00Z' }),
      now,
    )

    expect(deadline.overdue).toBe(true)
    expect(deadline.label).toBe('Overskredet med 1 t 30 min')
  })

  it('en færdig opgave er aldrig overskredet', () => {
    const deadline = productionDeadline(
      production({
        due_at: '2026-08-26T10:00:00Z',
        status: 'done',
        completed_at: '2026-08-26T09:00:00Z',
      }),
      now,
    )

    expect(deadline.overdue).toBe(false)
    expect(deadline.label).toBe('Færdig')
  })

  it('runder ikke det sidste minut op til 0 min', () => {
    const deadline = productionDeadline(
      production({ due_at: '2026-08-26T12:00:30Z' }),
      now,
    )

    expect(deadline.label).toBe('under et minut tilbage')
  })
})

describe('compareProductions', () => {
  it('lægger de mest presserende øverst og de færdige nederst', () => {
    const sorted = [
      production({ id: 'done', status: 'done', completed_at: 'x' }),
      production({ id: 'senere', due_at: '2026-08-27T12:00:00Z' }),
      production({ id: 'straks', due_at: '2026-08-26T09:00:00Z' }),
    ].sort(compareProductions)

    expect(sorted.map((entry) => entry.id)).toEqual([
      'straks',
      'senere',
      'done',
    ])
  })
})
