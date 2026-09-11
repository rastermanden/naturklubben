import { describe, expect, it } from 'vitest'
import { CAUSES, isCause, normalizeCauses, selectedCauses } from './causes'

describe('hjertesager', () => {
  it('kender de tre mærker', () => {
    expect(CAUSES.map((cause) => cause.slug)).toEqual([
      'ukraine',
      'regnbue',
      'vaccine',
    ])
    expect(isCause('regnbue')).toBe(true)
    expect(isCause('ananas')).toBe(false)
  })

  it('viser de valgte i listens rækkefølge og springer ukendte over', () => {
    expect(
      selectedCauses(['vaccine', 'ananas', 'ukraine']).map((c) => c.emoji),
    ).toEqual(['🇺🇦', '💉'])
    expect(selectedCauses(null)).toEqual([])
  })

  it('gemmer uden dubletter, så databasens constraint holder', () => {
    expect(normalizeCauses(['regnbue', 'regnbue', 'ukraine'])).toEqual([
      'ukraine',
      'regnbue',
    ])
    expect(normalizeCauses([])).toEqual([])
  })
})
