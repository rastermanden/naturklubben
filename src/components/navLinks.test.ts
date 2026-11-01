import { describe, expect, it } from 'vitest'
import { isNavLinkActive, navLinks } from './navLinks'

const activities = navLinks.find((link) => link.to === '/aktiviteter')!
const calendar = navLinks.find((link) => link.to === '/kalender')!

describe('navLinks (#285)', () => {
  it('har hverken Naturlog eller Spil som eget menupunkt', () => {
    const paths = navLinks.map((link) => link.to)
    expect(paths).not.toContain('/naturlog')
    expect(paths).not.toContain('/spil')
  })
})

describe('isNavLinkActive', () => {
  it('følger routerens vurdering for siden selv', () => {
    expect(isNavLinkActive(calendar, '/kalender', true)).toBe(true)
    expect(isNavLinkActive(calendar, '/chat', false)).toBe(false)
  })

  it('markerer Aktiviteter på Naturlog, Spil og deres undersider', () => {
    expect(isNavLinkActive(activities, '/naturlog', false)).toBe(true)
    expect(isNavLinkActive(activities, '/spil', false)).toBe(true)
    expect(isNavLinkActive(activities, '/spil/kabale', false)).toBe(true)
  })

  it('lader sig ikke snyde af en sti, der bare begynder ens', () => {
    expect(isNavLinkActive(activities, '/spillere', false)).toBe(false)
    expect(isNavLinkActive(activities, '/kalender', false)).toBe(false)
  })
})
