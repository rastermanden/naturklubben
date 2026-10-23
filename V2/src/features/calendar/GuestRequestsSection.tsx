import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { toFriendlyCalendarError } from './guestRequestErrors'
import { guestReplyMailto } from './guestReplyMailto'
import type { EventWithResponse, GuestRequest } from './types'
import { useEventGuestRequests } from './useEventGuests'

const requestDateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
})

/**
 * "Skriv til gæsten": en mailto: med emne og en klar dansk kladde, godkendt
 * eller afvist, med begivenhedens titel og tidspunkt indsat. Arrangøren retter
 * til og sender selv fra sin egen mailklient (#239) -- der er ingen automatisk
 * levering at vise status for.
 */
function WriteToGuestLink({
  request,
  event,
}: {
  request: GuestRequest
  event: EventWithResponse
}) {
  if (request.status !== 'approved' && request.status !== 'rejected') {
    return null
  }
  return (
    <a
      href={guestReplyMailto({
        status: request.status,
        fullName: request.fullName,
        email: request.email,
        event,
      })}
      className="text-xs underline"
    >
      Skriv til gæsten
    </a>
  )
}

function describe(request: GuestRequest) {
  const people = request.partySize > 1 ? ` · ${request.partySize} personer` : ''
  return `${request.fullName}${people}`
}

/**
 * Arrangørens overblik over gæsteansøgninger (#224): ventende ansøgninger med
 * godkend/afvis, godkendte gæster og afviste ansøgere, hver med en "Skriv til
 * gæsten"-knap. Ansøgningerne følger ikke med, når arrangøren lukker
 * begivenheden igen, så sektionen vises også på en privat begivenhed.
 *
 * Kun arrangøren og admins får data tilbage fra backend.
 */
export function GuestRequestsSection({ event }: { event: EventWithResponse }) {
  const requestsQuery = useEventGuestRequests(event.id, event.canEdit)
  const decideGuestRequest = useMutation(api.calendar.decideGuestRequest)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!event.canEdit) return null

  const requests = requestsQuery ?? []
  if (!event.isPublic && requestsQuery !== undefined && requests.length === 0) {
    return null
  }

  const pending = requests.filter((request) => request.status === 'pending')
  const approved = requests.filter((request) => request.status === 'approved')
  const rejected = requests.filter((request) => request.status === 'rejected')

  async function decide(
    request: GuestRequest,
    decision: 'approved' | 'rejected',
  ) {
    setError(null)
    setBusy(true)
    try {
      await decideGuestRequest({ requestId: request.id, decision })
    } catch (cause) {
      setError(toFriendlyCalendarError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="mt-6 border-t border-line pt-5"
      aria-labelledby="guest-requests-heading"
    >
      <h3 id="guest-requests-heading" className="font-semibold text-ink-body">
        Ansøgninger fra ikke-medlemmer
        {requestsQuery !== undefined && (
          <span className="ml-2 font-normal text-ink-subtle">
            ({pending.length} venter)
          </span>
        )}
      </h3>

      {requestsQuery === undefined && (
        <p role="status" className="mt-3 text-sm text-ink-subtle">
          Henter ansøgninger…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {requestsQuery !== undefined && requests.length === 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          Ingen har søgt om at deltage endnu.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Venter på svar">
          {pending.map((request) => (
            <li
              key={request.id}
              className="rounded border border-line bg-surface-sunken p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{describe(request)}</p>
                  <p className="text-sm text-ink-subtle">
                    <a href={`mailto:${request.email}`} className="underline">
                      {request.email}
                    </a>
                    {' · '}
                    {requestDateFormatter.format(new Date(request.createdAt))}
                  </p>
                  {request.message !== null && (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-ink">
                      {request.message}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void decide(request, 'rejected')}
                    disabled={busy}
                    aria-label={`Afvis ${request.fullName}`}
                    className="min-h-11 rounded border border-danger-line-strong px-3 py-2 text-sm text-danger disabled:opacity-60"
                  >
                    Afvis
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(request, 'approved')}
                    disabled={busy}
                    aria-label={`Godkend ${request.fullName}`}
                    className="min-h-11 rounded bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
                  >
                    Godkend
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {approved.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-ink-subtle">
            Godkendte gæster
          </h4>
          <ul className="mt-2 flex flex-col gap-1" aria-label="Godkendte gæster">
            {approved.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink"
              >
                <span>{describe(request)}</span>
                <WriteToGuestLink request={request} event={event} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-ink-subtle">Afvist</h4>
          <ul className="mt-2 flex flex-col gap-1" aria-label="Afviste">
            {rejected.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted"
              >
                <span>{describe(request)}</span>
                <WriteToGuestLink request={request} event={event} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
