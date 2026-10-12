import { useState } from 'react'
import { formatFirstDate, groupBySpecies } from '../summary'
import type { Observation } from '../types'
import { formatObservedOn, observerName } from '../observationInput'

interface SpeciesOverviewProps {
  observations: Observation[]
  year: number | null
}

function speciesLabel(label: string) {
  return label.charAt(0).toLocaleUpperCase('da-DK') + label.slice(1)
}

export function SpeciesOverview({ observations, year }: SpeciesOverviewProps) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const groups = groupBySpecies(observations)
  const ordered = [...groups].sort((a, b) => b.count - a.count)
  const earliest = groups.reduce<(typeof groups)[number] | undefined>(
    (best, group) =>
      !best ||
      group.firstObservation.observed_on < best.firstObservation.observed_on
        ? group
        : best,
    undefined,
  )
  const speciesCount = groups.length

  if (speciesCount === 0) {
    return (
      <p role="status" className="text-ink-subtle">
        {year
          ? `Der er ingen observationer fra ${year} endnu.`
          : 'Der er ingen observationer endnu.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line-soft bg-surface p-4">
        <p className="text-sm text-ink-subtle">
          {speciesCount} {speciesCount === 1 ? 'art' : 'arter'} ·{' '}
          {observations.length}{' '}
          {observations.length === 1 ? 'observation' : 'observationer'}
          {year ? ` i ${year}` : ' i alt'}
        </p>
        {earliest && (
          <p className="mt-1 text-ink-body">
            {year ? (
              <>
                <span className="font-medium">
                  {speciesLabel(earliest.label)}
                </span>{' '}
                blev første gang set i {year} den{' '}
                {formatObservedOn(earliest.firstObservation.observed_on)}.
              </>
            ) : (
              <>
                Den tidligste observation i loggen er en{' '}
                <span className="font-medium">
                  {speciesLabel(earliest.label)}
                </span>{' '}
                fra {formatObservedOn(earliest.firstObservation.observed_on)}.
              </>
            )}
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {ordered.map((group) => {
          const open = openKey === group.key
          const firstDate = year
            ? formatFirstDate(group.firstObservation.observed_on)
            : formatObservedOn(group.firstObservation.observed_on)
          return (
            <li key={group.key}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : group.key)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3 text-left"
                aria-expanded={open}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink-body">
                    {speciesLabel(group.label)}
                  </span>
                  <span className="text-sm text-ink-subtle">
                    {year ? 'første ' : 'først set '}
                    {firstDate}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold text-white">
                  {group.count}
                </span>
              </button>
              {open && (
                <ul className="mt-2 flex flex-col gap-1 pl-4">
                  {group.observations.map((observation) => (
                    <li
                      key={observation.id}
                      className="flex flex-wrap items-baseline gap-x-2 rounded border border-line-soft bg-surface px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink-body">
                        {formatObservedOn(observation.observed_on)}
                      </span>
                      {observation.location && (
                        <span className="text-ink-subtle">
                          {observation.location}
                        </span>
                      )}
                      <span className="text-ink-muted">
                        {observerName(observation)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
