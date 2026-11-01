import { describe, expect, it } from 'vitest'
import { isAndroidDevice, isIosDevice } from './platform'

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({
  userAgent,
  platform,
  maxTouchPoints,
})

describe('isIosDevice', () => {
  it('genkender iPhone', () => {
    expect(
      isIosDevice(
        nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
      ),
    ).toBe(true)
  })

  it('genkender iPadOS, der melder sig som Mac med touch', () => {
    expect(
      isIosDevice(
        nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5),
      ),
    ).toBe(true)
  })

  it('regner ikke en almindelig Mac som iOS', () => {
    expect(
      isIosDevice(
        nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0),
      ),
    ).toBe(false)
  })
})

describe('isAndroidDevice', () => {
  it('genkender Android', () => {
    expect(
      isAndroidDevice(nav('Mozilla/5.0 (Linux; Android 15; Pixel 9)')),
    ).toBe(true)
    expect(isAndroidDevice(nav('Mozilla/5.0 (Windows NT 10.0)'))).toBe(false)
  })
})
