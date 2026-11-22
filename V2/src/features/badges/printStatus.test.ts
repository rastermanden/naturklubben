import { describe, expect, it } from 'vitest'
import {
  isStalePrintRender,
  printStatusLabel,
  STALE_BADGE_PRINT_MS,
  type BadgePrintFields,
} from './printStatus'

const now = new Date('2026-08-29T12:00:00.000Z').getTime()

function badge(fields: Partial<BadgePrintFields>): BadgePrintFields {
  return {
    printStatus: 'pending',
    printStartedAt: undefined,
    updatedAt: now,
    ...fields,
  }
}

function minutesAgo(minutes: number) {
  return now - minutes * 60 * 1000
}

describe('trykfilens status', () => {
  it('regner en rendering, der lige er startet, som i gang', () => {
    const rendering = badge({
      printStatus: 'rendering',
      printStartedAt: minutesAgo(1),
    })

    expect(isStalePrintRender(rendering, now)).toBe(false)
    expect(printStatusLabel(rendering, now)).toBe('Trykfilen laves…')
  })

  it('regner en rendering, der aldrig meldte tilbage, som gået i stå', () => {
    const stuck = badge({
      printStatus: 'rendering',
      printStartedAt: now - STALE_BADGE_PRINT_MS - 1,
    })

    expect(isStalePrintRender(stuck, now)).toBe(true)
    expect(printStatusLabel(stuck, now)).toBe('Trykfilen gik i stå')
  })

  it('behandler en rendering uden starttidspunkt som gået i stå', () => {
    const noTimestamp = badge({
      printStatus: 'rendering',
      printStartedAt: undefined,
    })

    expect(isStalePrintRender(noTimestamp, now)).toBe(true)
  })

  it('viser klar, fejlet og manglende trykfil', () => {
    expect(printStatusLabel(badge({ printStatus: 'ready' }), now)).toBe(
      'Trykfil klar',
    )
    expect(printStatusLabel(badge({ printStatus: 'failed' }), now)).toBe(
      'Trykfilen fejlede',
    )
    expect(printStatusLabel(badge({ printStatus: 'pending' }), now)).toBe(
      'Trykfilen mangler',
    )
  })
})
