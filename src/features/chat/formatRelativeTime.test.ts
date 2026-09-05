import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

const now = new Date('2026-09-05T12:00:00.000Z')

function ago(seconds: number) {
  return new Date(now.getTime() - seconds * 1000).toISOString()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('formatRelativeTime', () => {
  it('skriver alderen så kort, at den kan stå på linje med navn og knapper', () => {
    vi.useFakeTimers({ now })

    expect(formatRelativeTime(ago(5))).toBe('nu')
    expect(formatRelativeTime(ago(59))).toBe('nu')
    expect(formatRelativeTime(ago(60))).toBe('1 min')
    expect(formatRelativeTime(ago(59 * 60))).toBe('59 min')
    expect(formatRelativeTime(ago(60 * 60))).toBe('1 t')
    expect(formatRelativeTime(ago(23 * 60 * 60))).toBe('23 t')
    expect(formatRelativeTime(ago(24 * 60 * 60))).toBe('1 d')
    expect(formatRelativeTime(ago(6 * 24 * 60 * 60))).toBe('6 d')
    expect(formatRelativeTime(ago(7 * 24 * 60 * 60))).toBe('1 u')
    expect(formatRelativeTime(ago(30 * 24 * 60 * 60))).toBe('1 md')
    expect(formatRelativeTime(ago(365 * 24 * 60 * 60))).toBe('1 år')
  })

  it('kalder en besked fra fremtiden "nu" i stedet for en negativ alder', () => {
    vi.useFakeTimers({ now })

    expect(formatRelativeTime(ago(-90))).toBe('nu')
  })
})
