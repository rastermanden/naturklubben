import { useState, type FormEvent } from 'react'
import type { CalendarEvent, EventInput } from './types'
import { parseMaxParticipants } from './waitlist'

interface EventFormProps {
  event?: CalendarEvent
  submitting: boolean
  error: string | null
  onSubmit: (input: EventInput) => void
  onCancel: () => void
}

/** ms -> værdien et `<input type="datetime-local">` forventer, i lokal tid. */
function toLocalDateTime(value?: number | null) {
  if (value === undefined || value === null) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/**
 * Formularen til at oprette og rette en begivenhed.
 *
 * Afviser de samme ting som backend (`EVENT_ENDS_BEFORE_START`,
 * `EVENT_CAP_INVALID`), men gør det i browseren først, så brugeren ikke skal
 * vente på et rundturs-svar for at få at vide, at sluttiden er før starten.
 */
export function EventForm({
  event,
  submitting,
  error,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [startAt, setStartAt] = useState(toLocalDateTime(event?.startAt))
  const [endAt, setEndAt] = useState(toLocalDateTime(event?.endAt))
  const [isPublic, setIsPublic] = useState(event?.isPublic ?? false)
  const [maxParticipants, setMaxParticipants] = useState(
    event?.maxParticipants?.toString() ?? '',
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setValidationError(null)

    if (endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
      setValidationError('Sluttidspunktet må ikke være før starttidspunktet.')
      return
    }

    const parsedMax = parseMaxParticipants(maxParticipants)
    if (parsedMax === undefined) {
      setValidationError('Antal pladser skal være et helt tal på mindst 1.')
      return
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      startAt: new Date(startAt).getTime(),
      endAt: endAt ? new Date(endAt).getTime() : null,
      isPublic,
      maxParticipants: parsedMax,
    })
  }

  const inputClass =
    'rounded border border-line-strong px-3 py-2 text-base text-ink'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
    >
      <div className="max-h-[95svh] w-full overflow-y-auto rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <h2
          id="event-form-title"
          className="mb-5 text-xl font-semibold text-ink-body"
        >
          {event ? 'Redigér begivenhed' : 'Ny begivenhed'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Titel
            <input
              id="event-title"
              required
              maxLength={120}
              defaultValue={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Beskrivelse
            <textarea
              id="event-description"
              rows={4}
              defaultValue={description}
              onChange={(changeEvent) =>
                setDescription(changeEvent.target.value)
              }
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Sted
            <input
              id="event-location"
              defaultValue={location}
              onChange={(changeEvent) => setLocation(changeEvent.target.value)}
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ink-body">
              Starter
              <input
                id="event-start-at"
                type="datetime-local"
                required
                value={startAt}
                onChange={(changeEvent) => setStartAt(changeEvent.target.value)}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink-body">
              Slutter
              <input
                id="event-end-at"
                type="datetime-local"
                min={startAt}
                value={endAt}
                onChange={(changeEvent) => setEndAt(changeEvent.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm text-ink-body">
              Max antal deltagere
              <input
                id="event-max-participants"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Ubegrænset"
                value={maxParticipants}
                onChange={(changeEvent) =>
                  setMaxParticipants(changeEvent.target.value)
                }
                aria-describedby="event-max-participants-hint"
                className={inputClass}
              />
            </label>
            <p
              id="event-max-participants-hint"
              className="text-xs text-ink-subtle"
            >
              Tomt betyder ubegrænset. Er der fyldt op, kommer nye tilmeldinger
              på venteliste.
            </p>
          </div>

          <label className="flex items-start gap-3 text-sm text-ink-body">
            <input
              id="event-is-public"
              type="checkbox"
              checked={isPublic}
              onChange={(changeEvent) =>
                setIsPublic(changeEvent.target.checked)
              }
              className="mt-1 h-5 w-5 shrink-0 accent-accent"
            />
            <span>
              Åben for ikke-medlemmer
              <span className="mt-0.5 block text-xs text-ink-subtle">
                Begivenheden vises på den offentlige kalender, og folk uden for
                klubben kan søge om at deltage. Du godkender selv ansøgningerne.
              </span>
            </span>
          </label>

          {(validationError ?? error) !== null && (
            <p role="alert" className="text-sm text-danger">
              {validationError ?? error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded border border-accent px-4 py-2 text-ink-muted"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
            >
              {submitting ? 'Gemmer…' : 'Gem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
