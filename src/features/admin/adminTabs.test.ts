import { describe, expect, it } from 'vitest'
import { ADMIN_TABS, DEFAULT_ADMIN_TAB, parseAdminTab } from './adminTabs'

describe('parseAdminTab', () => {
  it('accepts every tab id it advertises', () => {
    for (const tab of ADMIN_TABS) {
      expect(parseAdminTab(tab.id)).toBe(tab.id)
    }
  })

  it('falls back to the default when the parameter is missing', () => {
    expect(parseAdminTab(null)).toBe(DEFAULT_ADMIN_TAB)
  })

  it('falls back to the default instead of showing an empty panel', () => {
    expect(parseAdminTab('findes-ikke')).toBe(DEFAULT_ADMIN_TAB)
    expect(parseAdminTab('')).toBe(DEFAULT_ADMIN_TAB)
  })

  it('opens on the applications queue', () => {
    expect(DEFAULT_ADMIN_TAB).toBe('ansoegninger')
  })
})
