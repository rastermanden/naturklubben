import { describe, expect, it } from 'vitest'
import { contrastRatio, readableTextColor } from './colorContrast'

describe('color contrast', () => {
  it('calculates WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
    expect(contrastRatio('#fff', '#fff')).toBe(1)
    expect(contrastRatio('invalid', '#ffffff')).toBe(null)
  })

  it('chooses readable text for light and dark member colors', () => {
    expect(readableTextColor('#16a34a')).toBe('#000000')
    expect(readableTextColor('#65a30d')).toBe('#000000')
    expect(readableTextColor('#92400e')).toBe('#ffffff')
    expect(readableTextColor('#000')).toBe('#ffffff')
    expect(readableTextColor('invalid')).toBe('#000000')
  })
})
