import { useRef, useState, type FormEvent } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useErrorFocus } from '../../hooks/useErrorFocus'
import type { CalendarEvent, EventInput } from './useEvents'

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
  const [validationError, setValidationError] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const endInputRef = useRef<HTMLInputElement>(null)
  const focusEndError = useErrorFocus(endInputRef)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose: onCancel,
    initialFocusRef: titleInputRef,
  })

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setValidationError(null)

    if (endAt && new Date(endAt) < new Date(startAt)) {
      setValidationError('Sluttidspunktet skal være efter starttidspunktet.')
      focusEndError()
      return
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : null,
    })
  }

  const inputClass =
    'rounded border border-green-300 px-3 py-2 text-base text-gray-950'

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
      tabIndex={-1}
    >
      <div className="max-h-[95svh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <h2
          id="event-form-title"
          className="mb-5 text-xl font-semibold text-green-900"
        >
          {event ? 'Redigér begivenhed' : 'Ny begivenhed'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-green-900">
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

          <label className="flex flex-col gap-1 text-sm text-green-900">
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

          <label className="flex flex-col gap-1 text-sm text-green-900">
            Sted
            <input
              id="event-location"
              value={location}
              onChange={(changeEvent) => setLocation(changeEvent.target.value)}
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-green-900">
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

            <label className="flex flex-col gap-1 text-sm text-green-900">
              Slutter
              <input
                id="event-end-at"
                ref={endInputRef}
                type="datetime-local"
                min={startAt}
                value={endAt}
                onChange={(changeEvent) => setEndAt(changeEvent.target.value)}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={
                  validationError ? 'event-form-error' : undefined
                }
                className={inputClass}
              />
            </label>
          </div>

          {(validationError || error) && (
            <p
              id="event-form-error"
              role={validationError ? undefined : 'alert'}
              className="text-sm text-red-700"
            >
              {validationError ?? error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded border border-green-800 px-4 py-2 text-green-800"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
            >
              {submitting ? 'Gemmer…' : 'Gem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
