import { describe, expect, it } from 'vitest'
import {
  BEST_OF_DEFAULT,
  BEST_OF_FINAL,
  gamesToWin,
  rulesSummary,
} from './rules'

describe('gamesToWin', () => {
  it('kræver flertallet af spillene', () => {
    expect(gamesToWin(BEST_OF_DEFAULT)).toBe(2)
    expect(gamesToWin(BEST_OF_FINAL)).toBe(3)
  })
})

describe('rulesSummary', () => {
  it('fortæller hvordan en kamp og turneringen vindes ved alle-mod-alle', () => {
    const text = rulesSummary('round_robin')

    expect(text).toContain('Alle møder alle')
    expect(text).toContain('bedst af 3')
    expect(text).toContain('først til 2')
    // Alle-mod-alle har ingen finale at spille bedst af fem.
    expect(text).not.toContain('Finalen')
  })

  it('nævner finalen bedst af fem ved udslagsrunder', () => {
    const text = rulesSummary('single_elimination')

    expect(text).toContain('er du ude')
    expect(text).toContain('bedst af 3')
    expect(text).toContain('Finalen er bedst af 5')
    expect(text).toContain('først til 3')
    expect(text).toContain('sidder én over')
  })
})
