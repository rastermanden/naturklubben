import { describe, expect, it } from 'vitest'
import {
  formatFirstDate,
  groupBySpecies,
  observationsInYear,
  speciesKey,
  yearOverviewLines,
} from './summary'
import type { Observation } from './types'

function observation(overrides: Partial<Observation>): Observation {
  return {
    id: 'o',
    species: 'Solsort',
    location: null,
    observed_on: '2026-03-01',
    notes: null,
    latitude: null,
    longitude: null,
    photo_id: null,
    photo: null,
    created_by: 'user-a',
    observer: { id: 'user-a', full_name: 'Alice' },
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('speciesKey', () => {
  it('normaliserer store bogstaver, bindestreger og tegn', () => {
    expect(speciesKey('  Rød Glente ')).toBe('rød glente')
    expect(speciesKey('kantarel.')).toBe('kantarel')
    expect(speciesKey('Lille-Vandsalamander')).toBe('lille vandsalamander')
    expect(speciesKey('pindsvin--ung')).toBe('pindsvin ung')
  })
})

describe('groupBySpecies', () => {
  it('tæller observationer pr. art og finder den tidligste', () => {
    const groups = groupBySpecies([
      observation({ id: 'a', species: 'Solsort', observed_on: '2026-02-10' }),
      observation({ id: 'b', species: 'Solsort', observed_on: '2026-04-20' }),
      observation({ id: 'c', species: 'Ravn', observed_on: '2026-01-05' }),
    ])
    expect(groups).toHaveLength(2)
    const solsort = groups.find((g) => g.key === 'solsort')!
    expect(solsort.count).toBe(2)
    expect(solsort.firstObservation.id).toBe('a')
    const ravn = groups.find((g) => g.key === 'ravn')!
    expect(ravn.count).toBe(1)
  })

  it('samler alm. navn og navn med stort begyndelsesbogstav', () => {
    const groups = groupBySpecies([
      observation({ id: 'a', species: 'Skovsnegl' }),
      observation({ id: 'b', species: 'skovsnegl' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })
})

describe('observationsInYear', () => {
  it('filtrerer på året ud fra observed_on', () => {
    const observations = [
      observation({ id: 'a', observed_on: '2025-12-31' }),
      observation({ id: 'b', observed_on: '2026-01-01' }),
      observation({ id: 'c', observed_on: '2026-12-31' }),
      observation({ id: 'd', observed_on: '2027-01-01' }),
    ]
    expect(observationsInYear(observations, 2026).map((o) => o.id)).toEqual([
      'b',
      'c',
    ])
  })
})

describe('yearOverviewLines', () => {
  it('sorterer arterne efter "årets første" og begrænser antallet', () => {
    const groups = groupBySpecies([
      observation({
        id: 'a',
        species: 'Ravn',
        observed_on: '2026-01-05',
        created_at: '2026-01-05T08:00:00Z',
      }),
      observation({
        id: 'b',
        species: 'Solsort',
        observed_on: '2026-01-02',
        created_at: '2026-01-02T08:00:00Z',
      }),
      observation({
        id: 'c',
        species: 'Rød glente',
        observed_on: '2026-03-10',
        created_at: '2026-03-10T08:00:00Z',
      }),
    ])
    const lines = yearOverviewLines(groups, 2)
    expect(lines).toEqual([
      { species: 'Solsort', firstDate: '2. januar' },
      { species: 'Ravn', firstDate: '5. januar' },
    ])
  })
})

describe('formatFirstDate', () => {
  it('formaterer en dato uden år', () => {
    expect(formatFirstDate('2026-12-24')).toBe('24. december')
  })
})
