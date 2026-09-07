import { describe, expect, it } from 'vitest'
import { describeClear } from './announce'
import type { ClearEvent } from './engine'

function event(overrides: Partial<ClearEvent>): ClearEvent {
  return {
    lines: 1,
    tSpin: 'none',
    combo: 0,
    backToBack: false,
    points: 100,
    ...overrides,
  }
}

describe('describeClear', () => {
  it('navngiver de fire almindelige rydninger', () => {
    expect(describeClear(event({ lines: 1, points: 100 }))).toBe(
      'Enkelt -- 100 point',
    )
    expect(describeClear(event({ lines: 2, points: 300 }))).toBe(
      'Dobbelt -- 300 point',
    )
    expect(describeClear(event({ lines: 3, points: 500 }))).toBe(
      'Trippel -- 500 point',
    )
    expect(describeClear(event({ lines: 4, points: 800 }))).toBe(
      'Tetris! -- 800 point',
    )
  })

  it('nævner T-spin, kæde og to svære i træk', () => {
    expect(
      describeClear(
        event({ lines: 2, tSpin: 'full', backToBack: true, points: 1800 }),
      ),
    ).toBe('T-spin dobbelt i træk -- 1800 point')

    expect(describeClear(event({ lines: 0, tSpin: 'mini', points: 100 }))).toBe(
      'Mini T-spin -- 100 point',
    )

    expect(describeClear(event({ lines: 1, combo: 3, points: 250 }))).toBe(
      'Enkelt kæde x4 -- 250 point',
    )
  })

  it('siger ingenting, når intet blev ryddet', () => {
    expect(describeClear(event({ lines: 0, points: 0 }))).toBe('')
  })
})
