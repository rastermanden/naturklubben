import { describe, expect, it } from 'vitest'
import {
  draftFromObservation,
  filterObservations,
  formatObservedOn,
  formatPosition,
  localIsoDate,
  mapLinkFor,
  observerName,
  toFriendlyObservationError,
  validateObservationDraft,
} from './observationInput'
import type { Observation } from './types'

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    species: 'Rød glente',
    location: 'Mols Bjerge',
    observed_on: '2026-08-29',
    notes: null,
    latitude: null,
    longitude: null,
    photo_id: null,
    photo: null,
    created_by: 'user-a',
    observer: { id: 'user-a', full_name: 'Alice' },
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
    ...overrides,
  }
}

const draft = {
  species: '  Rød glente ',
  location: ' Mols Bjerge ',
  observedOn: '2026-08-29',
  notes: '',
  latitude: null,
  longitude: null,
}

describe('validateObservationDraft', () => {
  it('trimmer felterne og gør tomme valgfrie felter til null', () => {
    expect(validateObservationDraft(draft, '2026-08-29')).toEqual({
      ok: true,
      input: {
        species: 'Rød glente',
        location: 'Mols Bjerge',
        observed_on: '2026-08-29',
        notes: null,
        latitude: null,
        longitude: null,
      },
    })
  })

  it('kræver en art', () => {
    expect(
      validateObservationDraft({ ...draft, species: '   ' }, '2026-08-29'),
    ).toMatchObject({ ok: false, field: 'species' })
  })

  it('afviser en dato i fremtiden', () => {
    expect(
      validateObservationDraft(
        { ...draft, observedOn: '2026-08-30' },
        '2026-08-29',
      ),
    ).toMatchObject({ ok: false, field: 'observedOn' })
  })

  it('afviser en ugyldig dato', () => {
    expect(
      validateObservationDraft({ ...draft, observedOn: '' }, '2026-08-29'),
    ).toMatchObject({ ok: false, field: 'observedOn' })
  })

  it('beholder positionen', () => {
    const result = validateObservationDraft(
      { ...draft, latitude: 56.22, longitude: 10.55 },
      '2026-08-29',
    )
    expect(result).toMatchObject({
      ok: true,
      input: { latitude: 56.22, longitude: 10.55 },
    })
  })
})

describe('draftFromObservation', () => {
  it('starter en ny observation på dagens dato', () => {
    expect(draftFromObservation(null, '2026-08-29')).toEqual({
      species: '',
      location: '',
      observedOn: '2026-08-29',
      notes: '',
      latitude: null,
      longitude: null,
    })
  })

  it('udfylder felterne fra en eksisterende observation', () => {
    expect(
      draftFromObservation(
        observation({ notes: 'To stk.', latitude: 56.22, longitude: 10.55 }),
      ),
    ).toEqual({
      species: 'Rød glente',
      location: 'Mols Bjerge',
      observedOn: '2026-08-29',
      notes: 'To stk.',
      latitude: 56.22,
      longitude: 10.55,
    })
  })
})

describe('localIsoDate', () => {
  it('bruger den lokale kalenderdag, ikke UTC', () => {
    const lateEvening = new Date(2026, 7, 29, 23, 30)
    expect(localIsoDate(lateEvening)).toBe('2026-08-29')
  })
})

describe('formatObservedOn', () => {
  it('viser datoen på dansk uden at skride en dag', () => {
    expect(formatObservedOn('2026-08-29')).toBe('29. august 2026')
    expect(formatObservedOn('2026-01-01')).toBe('1. januar 2026')
  })
})

describe('position', () => {
  it('linker til et kort med en nål på positionen', () => {
    expect(mapLinkFor(56.2234567, 10.5512345)).toBe(
      'https://www.openstreetmap.org/?mlat=56.22346&mlon=10.55123#map=15/56.22346/10.55123',
    )
  })

  it('formaterer koordinater med verdenshjørner', () => {
    expect(formatPosition(56.22, 10.55)).toBe('56.2200° N, 10.5500° Ø')
    expect(formatPosition(-33.86, -151.2)).toBe('33.8600° S, 151.2000° V')
  })
})

describe('observerName', () => {
  it('viser observatørens navn', () => {
    expect(observerName(observation())).toBe('Alice')
  })

  it('viser "Tidligere medlem", når kontoen er slettet', () => {
    expect(
      observerName(observation({ created_by: null, observer: null })),
    ).toBe('Tidligere medlem')
  })

  it('falder tilbage, når profilen ikke har et navn', () => {
    expect(
      observerName(observation({ observer: { id: 'user-a', full_name: ' ' } })),
    ).toBe('Unavngivet medlem')
  })
})

describe('filterObservations', () => {
  const list = [
    observation({ id: '1', species: 'Rød glente', location: 'Mols Bjerge' }),
    observation({ id: '2', species: 'Ravn', location: 'Rold Skov' }),
    observation({
      id: '3',
      species: 'Kantarel',
      location: null,
      notes: 'Fundet ved Mols',
    }),
  ]

  it('viser alt uden søgning', () => {
    expect(filterObservations(list, '  ')).toHaveLength(3)
  })

  it('søger i art, sted og noter uafhængigt af store og små bogstaver', () => {
    expect(filterObservations(list, 'mols').map((o) => o.id)).toEqual([
      '1',
      '3',
    ])
    expect(filterObservations(list, 'RAVN').map((o) => o.id)).toEqual(['2'])
  })
})

describe('toFriendlyObservationError', () => {
  it('forklarer en afvist skrivning som manglende rettigheder', () => {
    expect(toFriendlyObservationError({ code: '42501' })).toContain(
      'rettigheder',
    )
  })

  it('har en generel fejlbesked til alt andet', () => {
    expect(toFriendlyObservationError(new Error('boom'))).toBe(
      'Observationen kunne ikke gemmes. Prøv igen.',
    )
  })
})
