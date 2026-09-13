import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { toFriendlyGuestRequestError } from './guestRequestErrors'
import type { PublicEvent } from './usePublicEvents'
import { useSubmitGuestRequest } from './useEventGuests'

export const MAX_GUEST_PARTY_SIZE = 20

interface GuestRequestFormProps {
  event: PublicEvent
  onClose: () => void
}

/**
 * "Søg om at deltage" for folk uden for klubben (#224). Ingen login: navn,
 * e-mail, antal personer og en valgfri besked sendes til Edge Functionen,
 * som rate-limiter og gemmer ansøgningen til arrangøren.
 */
export function GuestRequestForm({ event, onClose }: GuestRequestFormProps) {
  const submitRequest = useSubmitGuestRequest()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [partySize, setPartySize] = useState('1')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: nameInputRef,
  })

  // Formularen forsvinder efter kvitteringen; flyt fokus med, så tastatur- og
  // skærmlæserbrugere ikke står på et element, der ikke findes længere.
  useEffect(() => {
    if (submitted) closeButtonRef.current?.focus()
  }, [submitted])

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setError(null)

    const people = Number(partySize)
    if (
      !Number.isInteger(people) ||
      people < 1 ||
      people > MAX_GUEST_PARTY_SIZE
    ) {
      setError(`Antal personer skal være mellem 1 og ${MAX_GUEST_PARTY_SIZE}.`)
      return
    }

    try {
      await submitRequest.mutateAsync({
        eventId: event.id,
        fullName,
        email,
        message,
        partySize: people,
      })
      setSubmitted(true)
    } catch (submitError) {
      setError(toFriendlyGuestRequestError(submitError))
    }
  }

  const inputClass =
    'rounded border border-line-strong px-3 py-2 text-base text-ink'

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-request-title"
      tabIndex={-1}
    >
      <div className="max-h-[95svh] w-full overflow-y-auto rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        {submitted ? (
          <div className="flex flex-col gap-4">
            <h2
              id="guest-request-title"
              className="text-xl font-semibold text-ink-body"
            >
              Ansøgning modtaget
            </h2>
            <p className="text-ink-muted">
              Tak! Arrangøren ser på din ansøgning til “{event.title}”. Du
              hører fra en arrangør pr. e-mail.
            </p>
            <div className="flex justify-end">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="min-h-11 rounded bg-accent px-4 py-2 text-white"
              >
                Luk
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2
              id="guest-request-title"
              className="text-xl font-semibold text-ink-body"
            >
              Søg om at deltage
            </h2>
            <p className="mt-1 mb-5 text-sm text-ink-muted">
              {event.title}. Arrangøren godkender eller afviser ansøgningen, og
              du hører fra en arrangør pr. e-mail.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm text-ink-body">
                Navn
                <input
                  id="guest-full-name"
                  ref={nameInputRef}
                  type="text"
                  required
                  maxLength={200}
                  autoComplete="name"
                  value={fullName}
                  onChange={(changeEvent) =>
                    setFullName(changeEvent.target.value)
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink-body">
                E-mail
                <input
                  id="guest-email"
                  type="email"
                  required
                  maxLength={320}
                  autoComplete="email"
                  value={email}
                  onChange={(changeEvent) => setEmail(changeEvent.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink-body">
                Antal personer
                <input
                  id="guest-party-size"
                  type="number"
                  required
                  min={1}
                  max={MAX_GUEST_PARTY_SIZE}
                  inputMode="numeric"
                  value={partySize}
                  onChange={(changeEvent) =>
                    setPartySize(changeEvent.target.value)
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink-body">
                Besked til arrangøren (valgfri)
                <textarea
                  id="guest-message"
                  rows={3}
                  maxLength={2000}
                  value={message}
                  onChange={(changeEvent) =>
                    setMessage(changeEvent.target.value)
                  }
                  className={inputClass}
                />
              </label>

              {error && (
                <p
                  id="guest-request-error"
                  role="alert"
                  className="text-sm text-danger"
                >
                  {error}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded border border-accent px-4 py-2 text-ink-muted"
                >
                  Annuller
                </button>
                <button
                  type="submit"
                  disabled={submitRequest.isPending}
                  className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
                >
                  {submitRequest.isPending ? 'Sender…' : 'Send ansøgning'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
