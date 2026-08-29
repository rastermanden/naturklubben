import { describe, expect, it } from 'vitest'
import {
  badgePrintPollInterval,
  BADGE_PRINT_POLL_MS,
  isPrintRenderInFlight,
  isStalePrintRender,
  printStatusLabel,
  STALE_BADGE_PRINT_MS,
} from './printStatus'
import type { Badge } from './types'

const now = new Date('2026-08-29T12:00:00.000Z').getTime()

function badge(fields: Partial<Badge>) {
  return {
    print_status: 'pending',
    print_started_at: null,
    updated_at: new Date(now).toISOString(),
    ...fields,
  } as Pick<Badge, 'print_status' | 'print_started_at' | 'updated_at'>
}

function minutesAgo(minutes: number) {
  return new Date(now - minutes * 60 * 1000).toISOString()
}

describe('trykfilens status', () => {
  it('regner en rendering, der lige er startet, som i gang', () => {
    const rendering = badge({
      print_status: 'rendering',
      print_started_at: minutesAgo(1),
    })

    expect(isStalePrintRender(rendering, now)).toBe(false)
    expect(isPrintRenderInFlight(rendering, now)).toBe(true)
    expect(printStatusLabel(rendering, now)).toBe('Trykfilen laves…')
  })

  it('regner en rendering, der aldrig meldte tilbage, som gået i stå', () => {
    // Dør Edge Functionen undervejs, kommer der aldrig et
    // complete_badge_print. Databasen giver claim'et fri igen efter
    // STALE_BADGE_PRINT_MS, og fra samme øjeblik skal UI'et holde op med at
    // sige, at filen er på vej.
    const stuck = badge({
      print_status: 'rendering',
      print_started_at: new Date(now - STALE_BADGE_PRINT_MS - 1).toISOString(),
    })

    expect(isStalePrintRender(stuck, now)).toBe(true)
    expect(isPrintRenderInFlight(stuck, now)).toBe(false)
    expect(printStatusLabel(stuck, now)).toBe('Trykfilen gik i stå')
  })

  it('venter på claimet lige efter en gemning', () => {
    const justSaved = badge({
      print_status: 'pending',
      updated_at: minutesAgo(0),
    })
    const longPending = badge({
      print_status: 'pending',
      updated_at: minutesAgo(30),
    })

    expect(isPrintRenderInFlight(justSaved, now)).toBe(true)
    expect(isPrintRenderInFlight(longPending, now)).toBe(false)
    expect(printStatusLabel(longPending, now)).toBe('Trykfilen mangler')
  })

  it('poller kun, mens der faktisk er noget at vente på', () => {
    const ready = badge({ print_status: 'ready', updated_at: minutesAgo(30) })
    const rendering = badge({
      print_status: 'rendering',
      print_started_at: minutesAgo(1),
    })

    expect(badgePrintPollInterval([ready], now)).toBe(false)
    expect(badgePrintPollInterval([], now)).toBe(false)
    expect(badgePrintPollInterval(undefined, now)).toBe(false)
    expect(badgePrintPollInterval([ready, rendering], now)).toBe(
      BADGE_PRINT_POLL_MS,
    )
  })

  it('behandler en rendering uden starttidspunkt som gået i stå', () => {
    const noTimestamp = badge({
      print_status: 'rendering',
      print_started_at: null,
    })

    expect(isStalePrintRender(noTimestamp, now)).toBe(true)
  })
})
