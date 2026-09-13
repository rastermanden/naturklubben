import { useRef, useState, type FormEvent } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useErrorFocus } from '../../hooks/useErrorFocus'
import type { CalendarEvent, EventInput } from './useEvents'
import { parseMaxParticipants } from './waitlist'

interface EventFormProps {
  event?: CalendarEvent
  submitting: boolean
  error: string | null
  onSubmit: (input: EventInput) => void
  onCancel: () => void
}

function toLocalDateTime(isoDate?: string | null) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

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
  const [startAt, setStartAt] = useState(toLocalDateTime(event?.start_at))
  const [endAt, setEndAt] = useState(toLocalDateTime(event?.end_at))
  const [isPublic, setIsPublic] = useState(event?.is_public ?? false)
  const [maxParticipants, setMaxParticipants] = useState(
    event?.max_participants?.toString() ?? '',
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<'end' | 'max' | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const endInputRef = useRef<HTMLInputElement>(null)
  const maxInputRef = useRef<HTMLInputElement>(null)
  const focusEndError = useErrorFocus(endInputRef)
  const focusMaxError = useErrorFocus(maxInputRef)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose: onCancel,
    initialFocusRef: titleInputRef,
  })

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setValidationError(null)
    setInvalidField(null)

    if (endAt && new Date(endAt) < new Date(startAt)) {
      setValidationError('Sluttidspunktet må ikke være før starttidspunktet.')
      setInvalidField('end')
      focusEndError()
      return
    }

    const parsedMax = parseMaxParticipants(maxParticipants)
    if (parsedMax === undefined) {
      setValidationError('Antal pladser skal være et helt tal på mindst 1.')
      setInvalidField('max')
      focusMaxError()
      return
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : null,
      is_public: isPublic,
      max_participants: parsedMax,
    })
  }

  const inputClass =
    'rounded border border-line-strong px-3 py-2 text-base text-ink'

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
      tabIndex={-1}
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
              ref={titleInputRef}
              required
              maxLength={120}
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Beskrivelse
            <textarea
              id="event-description"
              rows={4}
              value={description}
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
              value={location}
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
                ref={endInputRef}
                type="datetime-local"
                min={startAt}
                value={endAt}
                onChange={(changeEvent) => setEndAt(changeEvent.target.value)}
                aria-invalid={invalidField === 'end' ? true : undefined}
                aria-describedby={
                  invalidField === 'end' ? 'event-form-error' : undefined
                }
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm text-ink-body">
              Max antal deltagere
              <input
                id="event-max-participants"
                ref={maxInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Ubegrænset"
                value={maxParticipants}
                onChange={(changeEvent) =>
                  setMaxParticipants(changeEvent.target.value)
                }
                aria-invalid={invalidField === 'max' ? true : undefined}
                aria-describedby={
                  invalidField === 'max'
                    ? 'event-form-error'
                    : 'event-max-participants-hint'
                }
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

          {(validationError || error) && (
            <p
              id="event-form-error"
              role={validationError ? undefined : 'alert'}
              className="text-sm text-danger"
            >
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
