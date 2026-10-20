import { useState, type FormEvent } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  NOTES_MAX_LENGTH,
  SPECIES_MAX_LENGTH,
  draftFromObservation,
  formatPosition,
  validateObservationDraft,
  type ObservationDraft,
} from './observationDraft'
import { observationErrorMessage, useObservationActions } from './useObservations'

interface ObservationFormProps {
  /** Sat, når et fund rettes; null når et nyt skrives. */
  editing: Doc<'observations'> | null
  onDone: () => void
  onCancel: () => void
}

/**
 * Formularen til et fund. Felterne og grænserne er de samme som i den gamle
 * app; positionen sættes med telefonens egen, og kan fjernes igen.
 *
 * Billede fra galleriet er ikke med: galleriet er ikke portet til V2 endnu, så
 * `observations.photoId` har ingen billeder at pege på.
 */
export function ObservationForm({
  editing,
  onDone,
  onCancel,
}: ObservationFormProps) {
  const { add, update } = useObservationActions()
  const [draft, setDraft] = useState(() => draftFromObservation(editing))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setField<K extends keyof ObservationDraft>(
    key: K,
    value: ObservationDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function pickMyPosition() {
    if (!('geolocation' in navigator)) {
      setError('Telefonen vil ikke give sin position.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setField('latitude', position.coords.latitude)
        setField('longitude', position.coords.longitude)
      },
      () => setError('Positionen kunne ikke hentes.'),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const validation = validateObservationDraft(draft)
    if (!validation.ok) {
      setError(validation.message)
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await update({ observationId: editing._id, ...validation.input })
      } else {
        await add(validation.input)
      }
      onDone()
    } catch (cause) {
      setError(observationErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const hasPosition = draft.latitude !== null && draft.longitude !== null

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4"
    >
      <h2 className="text-lg font-semibold text-ink-body">
        {editing ? 'Ret fundet' : 'Nyt fund'}
      </h2>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Hvad så du?
        <input
          value={draft.species}
          onChange={(event) => setField('species', event.target.value)}
          maxLength={SPECIES_MAX_LENGTH}
          required
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm text-ink-muted">
          Dato
          <input
            type="date"
            value={draft.observedOn}
            onChange={(event) => setField('observedOn', event.target.value)}
            required
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm text-ink-muted">
          Sted
          <input
            value={draft.location}
            onChange={(event) => setField('location', event.target.value)}
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Note
        <textarea
          value={draft.notes}
          onChange={(event) => setField('notes', event.target.value)}
          maxLength={NOTES_MAX_LENGTH}
          rows={3}
          className="rounded-lg border border-line px-3 py-2 text-ink"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {hasPosition ? (
          <>
            <span className="text-ink-subtle">
              {formatPosition(draft.latitude ?? 0, draft.longitude ?? 0)}
            </span>
            <button
              type="button"
              onClick={() => {
                setField('latitude', null)
                setField('longitude', null)
              }}
              className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink-muted"
            >
              Fjern position
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={pickMyPosition}
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink-muted"
          >
            Brug min position
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-accent px-4 py-2 font-medium text-on-accent disabled:opacity-60"
        >
          {busy ? 'Gemmer…' : 'Gem fundet'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line px-4 py-2 text-ink-muted"
        >
          Annullér
        </button>
      </div>
    </form>
  )
}
