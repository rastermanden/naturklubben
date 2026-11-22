import { describe, expect, it } from 'vitest'
import { wishesByCategory } from './mealCategories'

describe('wishesByCategory', () => {
  it('samler ønskerne i rækkefølgen pålæg, brød, snacks, andet', () => {
    const groups = wishesByCategory([
      { category: 'snacks' as const, text: 'nødder' },
      { category: 'paalaeg' as const, text: 'leverpostej' },
      { category: 'paalaeg' as const, text: 'ost' },
      { category: 'andet' as const, text: 'kaffe' },
    ])

    expect(groups.map((group) => group.label)).toEqual([
      'Pålæg',
      'Brød',
      'Snacks',
      'Andet',
    ])
    expect(groups[0]?.wishes.map((wish) => wish.text)).toEqual([
      'leverpostej',
      'ost',
    ])
    expect(groups[1]?.wishes).toEqual([])
    expect(groups[2]?.wishes.map((wish) => wish.text)).toEqual(['nødder'])
    expect(groups[3]?.wishes.map((wish) => wish.text)).toEqual(['kaffe'])
  })
})
