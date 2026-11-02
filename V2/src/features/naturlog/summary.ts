import type { Observation } from './types'

export function speciesKey(species: string): string {
  return species
    .trim()
    .toLocaleLowerCase('da-DK')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?()*]+$/g, '')
    .trim()
}

export interface SpeciesGroup {
  key: string
  /** Eksempel på navnet, som et medlem faktisk skrev. */
  label: string
  /** Antal observationer i gruppen. */
  count: number
  /** Den tidligste observation -- pr. år er det "årets første". */
  firstObservation: Observation
  /** Alle observationerne i gruppen, sorteret efter dato. */
  observations: Observation[]
}

export function observationsInYear(
  observations: Observation[],
  year: number,
): Observation[] {
  const prefix = String(year)
  return observations.filter((observation) =>
    observation.observed_on.startsWith(prefix),
  )
}

export function groupBySpecies(observations: Observation[]): SpeciesGroup[] {
  const byKey = new Map<string, SpeciesGroup>()
  const sorted = [...observations].sort(
    (a, b) =>
      a.observed_on.localeCompare(b.observed_on) ||
      a.created_at.localeCompare(b.created_at),
  )
  for (const observation of sorted) {
    const key = speciesKey(observation.species)
    const group = byKey.get(key)
    if (group) {
      group.count += 1
      group.observations.push(observation)
    } else {
      byKey.set(key, {
        key,
        label: observation.species.trim(),
        count: 1,
        firstObservation: observation,
        observations: [observation],
      })
    }
  }
  return [...byKey.values()]
}

export interface OverviewLine {
  species: string
  /** fx "4. januar" -- årets første gang, arten blev set. */
  firstDate: string
}

/** De tidligst sete arter i året, klargjort til oversigten. */
export function yearOverviewLines(
  groups: SpeciesGroup[],
  limit = 3,
): OverviewLine[] {
  return [...groups]
    .sort((a, b) =>
      a.firstObservation.observed_on.localeCompare(
        b.firstObservation.observed_on,
      ),
    )
    .slice(0, limit)
    .map((group) => ({
      species: group.label,
      firstDate: formatFirstDate(group.firstObservation.observed_on),
    }))
}

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
})

export function formatFirstDate(observedOn: string): string {
  const [, month, day] = observedOn.split('-').map(Number)
  return dateFormatter.format(new Date(2000, month - 1, day))
}

export function countWithPosition(observations: Observation[]): number {
  return observations.filter(
    (observation) =>
      observation.latitude !== null && observation.longitude !== null,
  ).length
}
