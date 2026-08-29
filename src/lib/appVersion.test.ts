import { describe, expect, it } from 'vitest'
import { formatAppVersion } from './appVersion'

describe('formatAppVersion', () => {
  it('sætter version og commit-dato sammen', () => {
    expect(formatAppVersion('37a86ae', '2026-08-29T08:44:00Z')).toBe(
      '37a86ae · 29.08.2026',
    )
  })

  it('viser tagget, når der er tagget', () => {
    expect(formatAppVersion('v1.2.0', '2026-08-29T08:44:00Z')).toBe(
      'v1.2.0 · 29.08.2026',
    )
  })

  it('viser versionen alene uden dato', () => {
    expect(formatAppVersion('37a86ae', null)).toBe('37a86ae')
  })

  it('viser versionen alene, når datoen ikke kan læses', () => {
    expect(formatAppVersion('37a86ae', 'ikke en dato')).toBe('37a86ae')
  })
})
