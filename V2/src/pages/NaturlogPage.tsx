import { useState } from 'react'
import type { Doc } from '../../convex/_generated/dataModel'
import { ObservationForm } from '../features/naturlog/ObservationForm'
import {
  formatObservedOn,
  formatPosition,
  mapLinkFor,
  matchesSearch,
} from '../features/naturlog/observationDraft'
import {
  observationErrorMessage,
  useObservationActions,
  useObservations,
} from '../features/naturlog/useObservations'

/**
 * Naturloggen: hvad klubben har set, nyeste først -- og en formular til at
 * skrive det næste fund.
 *
 * Siden er den samme som før, men uden billedvalg: galleriet er ikke portet til
 * V2 endnu, så der er ingen billeder at vælge imellem. Søgningen foregår i
 * klienten over de hentede rækker, fordi Convex ikke har `ilike`.
 */
export default function NaturlogPage() {
  const observations = useObservations()
  const { remove } = useObservationActions()
  const [query, setQuery] = useState('')
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState<Doc<'observations'> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = (observations ?? []).filter((observation) =>
    matchesSearch(observation, query),
  )

  function closeForm() {
    setWriting(false)
    setEditing(null)
  }

  async function deleteObservation(observation: Doc<'observations'>) {
    const question = `Vil du slette fundet af ${observation.species}?`
    if (!window.confirm(question)) return
    setError(null)
    try {
      await remove({ observationId: observation._id })
    } catch (cause) {
      setError(observationErrorMessage(cause))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink-body">Naturlog</h1>
        <p className="text-ink-subtle">
          Hvad har du set? Skriv art, sted og dato -- gerne med en note og din
          position. Hele klubben kan se loggen.
        </p>
      </div>

      {!writing && editing === null && (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="min-h-11 self-start rounded-lg bg-accent px-4 py-2 font-medium text-on-accent"
        >
          Skriv i loggen
        </button>
      )}

      {(writing || editing !== null) && (
        <ObservationForm
          editing={editing}
          onDone={closeForm}
          onCancel={closeForm}
        />
      )}

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Søg i loggen
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {observations === undefined && (
        <p className="text-ink-subtle">Henter loggen…</p>
      )}

      {observations !== undefined && visible.length === 0 && (
        <p className="rounded-xl border border-line-soft bg-surface px-4 py-8 text-center text-ink-subtle">
          {query
            ? 'Ingen fund passer på søgningen.'
            : 'Loggen er tom endnu. Den første, der skriver, står øverst.'}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {visible.map((observation) => (
          <li
            key={observation._id}
            className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink-body">
                {observation.species}
              </h2>
              <time
                dateTime={observation.observedOn}
                className="text-sm text-ink-subtle"
              >
                {formatObservedOn(observation.observedOn)}
              </time>
            </div>

            {observation.location && (
              <p className="text-sm text-ink-muted">{observation.location}</p>
            )}

            {observation.notes && (
              <p className="whitespace-pre-line text-ink-body">
                {observation.notes}
              </p>
            )}

            {observation.latitude !== undefined &&
              observation.longitude !== undefined && (
                <a
                  href={mapLinkFor(observation.latitude, observation.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="self-start text-sm text-ink-muted underline"
                >
                  {formatPosition(observation.latitude, observation.longitude)}
                </a>
              )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-subtle">
              <span>{observation.createdByName}</span>
              <span className="flex gap-3">
                {observation.isOwn && (
                  <button
                    type="button"
                    onClick={() => setEditing(observation)}
                    className="underline"
                  >
                    Ret
                  </button>
                )}
                {observation.canDelete && (
                  <button
                    type="button"
                    onClick={() => void deleteObservation(observation)}
                    className="underline"
                  >
                    Slet
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
