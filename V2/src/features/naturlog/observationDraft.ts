import type { Doc } from '../../../convex/_generated/dataModel'

/**
 * Reglerne for en naturlog-observation, som formularen og mutationen er enige
 * om.
 *
 * Kopieret fra den gamle apps `observationInput.ts`, men med camelCase-felter,
 * fordi V2's dokumenter er JavaScript-objekter hele vejen igennem. Selve
 * reglerne er uændrede: art påkrævet og højst 120 tegn, sted 200, note 2000,
 * en rigtig kalenderdag og ikke en dag i fremtiden.
 */

export const SPECIES_MAX_LENGTH = 120
export const LOCATION_MAX_LENGTH = 200
export const NOTES_MAX_LENGTH = 2000

export interface ObservationDraft {
  species: string
  location: string
  observedOn: string
  notes: string
  latitude: number | null
  longitude: number | null
}

export type DraftField = 'species' | 'observedOn' | 'location' | 'notes'

export interface ObservationInput {
  species: string
  location?: string
  observedOn: string
  notes?: string
  latitude?: number
  longitude?: number
}

export type DraftValidation =
  | { ok: true; input: ObservationInput }
  | { ok: false; field: DraftField; message: string }

/** Dagens dato i brugerens egen tidszone som `YYYY-MM-DD`. */
export function localIsoDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateObservationDraft(
  draft: ObservationDraft,
  today = localIsoDate(),
): DraftValidation {
  const species = draft.species.trim()
  if (!species) {
    return { ok: false, field: 'species', message: 'Skriv, hvad du så.' }
  }
  if (species.length > SPECIES_MAX_LENGTH) {
    return {
      ok: false,
      field: 'species',
      message: `Hold det under ${SPECIES_MAX_LENGTH} tegn.`,
    }
  }

  const location = draft.location.trim()
  if (location.length > LOCATION_MAX_LENGTH) {
    return {
      ok: false,
      field: 'location',
      message: `Stedet må højst være ${LOCATION_MAX_LENGTH} tegn.`,
    }
  }

  const notes = draft.notes.trim()
  if (notes.length > NOTES_MAX_LENGTH) {
    return {
      ok: false,
      field: 'notes',
      message: `Noterne må højst være ${NOTES_MAX_LENGTH} tegn.`,
    }
  }

  if (
    !ISO_DATE.test(draft.observedOn) ||
    Number.isNaN(Date.parse(draft.observedOn))
  ) {
    return { ok: false, field: 'observedOn', message: 'Vælg en dato.' }
  }
  if (draft.observedOn > today) {
    return {
      ok: false,
      field: 'observedOn',
      message: 'Datoen kan ikke ligge i fremtiden.',
    }
  }

  const hasLatitude = draft.latitude !== null
  const hasLongitude = draft.longitude !== null
  if (hasLatitude !== hasLongitude) {
    return {
      ok: false,
      field: 'location',
      message: 'Positionen skal have både bredde- og længdegrad.',
    }
  }

  return {
    ok: true,
    input: {
      species,
      location: location || undefined,
      observedOn: draft.observedOn,
      notes: notes || undefined,
      latitude: draft.latitude ?? undefined,
      longitude: draft.longitude ?? undefined,
    },
  }
}

export function draftFromObservation(
  observation: Doc<'observations'> | null,
  today = localIsoDate(),
): ObservationDraft {
  return {
    species: observation?.species ?? '',
    location: observation?.location ?? '',
    observedOn: observation?.observedOn ?? today,
    notes: observation?.notes ?? '',
    latitude: observation?.latitude ?? null,
    longitude: observation?.longitude ?? null,
  }
}

/** Link til et kort med en nål -- uden et indlejret kort-SDK i første omgang. */
export function mapLinkFor(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5)
  const lng = longitude.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`
}

export function formatPosition(latitude: number, longitude: number): string {
  const ns = latitude >= 0 ? 'N' : 'S'
  const ew = longitude >= 0 ? 'Ø' : 'V'
  return `${Math.abs(latitude).toFixed(4)}° ${ns}, ${Math.abs(longitude).toFixed(4)}° ${ew}`
}

const observedOnFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `YYYY-MM-DD` er en kalenderdag; parse den lokalt, så den ikke skrider en dag. */
export function formatObservedOn(observedOn: string): string {
  const [year, month, day] = observedOn.split('-').map(Number)
  return observedOnFormatter.format(new Date(year, month - 1, day))
}

/** Fritekstsøgning i de hentede rækker -- Convex har ingen `ilike`. */
export function matchesSearch(
  observation: Doc<'observations'>,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase('da-DK')
  if (!needle) return true
  return [observation.species, observation.location, observation.notes]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase('da-DK').includes(needle))
}
