import { useState } from 'react'
import { toFriendlyGuestDecisionError } from './guestRequestErrors'
import { guestReplyMailto, type GuestReplyEvent } from './guestReplyMailto'
import { useEventGuestRequests, type EventGuestRequest } from './useEventGuests'

const requestDateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
})

interface GuestRequestsSectionProps {
  eventId: string
  isPublic: boolean
  /** Kun arrangøren og admins kan læse ansøgningerne (RLS). */
  canManage: boolean
  /** Titel, sted og tidspunkt til "Skriv til gæsten"-kladden (#239). */
  event: GuestReplyEvent
}

/**
 * "Skriv til gæsten": åbner en mailto: med emne og en klar dansk kladde,
 * godkendt eller afvist, med begivenhedens titel og tidspunkt indsat.
 * Arrangøren retter til og sender selv fra sin egen mailklient (#239) --
 * der er ingen automatisk levering eller leveringsstatus at vise.
 */
function WriteToGuestLink({
  request,
  event,
}: {
  request: EventGuestRequest
  event: GuestReplyEvent
}) {
  if (request.status !== 'approved' && request.status !== 'rejected') {
    return null
  }
  const href = guestReplyMailto({
    status: request.status,
    fullName: request.full_name,
    email: request.email,
    event,
  })
  return (
    <a href={href} className="text-xs underline">
      Skriv til gæsten
    </a>
  )
}

/**
 * Arrangørens overblik over gæsteansøgninger på en åben begivenhed (#224):
 * ventende ansøgninger med godkend/afvis, godkendte gæster og afviste
 * ansøgere, hver med en "Skriv til gæsten"-knap. Ansøgningerne følger ikke
 * med, når arrangøren lukker begivenheden igen, så sektionen vises også på
 * en privat begivenhed, så længe der er ansøgninger på den. Kun
 * arrangør/admin får data tilbage.
 */
export function GuestRequestsSection({
  eventId,
  isPublic,
  canManage,
  event,
}: GuestRequestsSectionProps) {
  const { requestsQuery, approveRequest, rejectRequest } =
    useEventGuestRequests(eventId, canManage)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  if (!canManage) return null

  const requests = requestsQuery.data ?? []
  if (!isPublic && !requestsQuery.isError && requests.length === 0) return null

  const pending = requests.filter((request) => request.status === 'pending')
  const approved = requests.filter((request) => request.status === 'approved')
  const rejected = requests.filter((request) => request.status === 'rejected')
  const deciding = approveRequest.isPending || rejectRequest.isPending

  function decide(request: EventGuestRequest, decision: 'approve' | 'reject') {
    setDecisionError(null)
    const mutation = decision === 'approve' ? approveRequest : rejectRequest
    mutation
      .mutateAsync(request.id)
      .catch((error) => setDecisionError(toFriendlyGuestDecisionError(error)))
  }

  function describe(request: EventGuestRequest) {
    const people =
      request.party_size > 1 ? ` · ${request.party_size} personer` : ''
    return `${request.full_name}${people}`
  }

  return (
    <section
      className="mt-6 border-t border-line pt-5"
      aria-labelledby="guest-requests-heading"
    >
      <h3 id="guest-requests-heading" className="font-semibold text-ink-body">
        Ansøgninger fra ikke-medlemmer
        {requestsQuery.data && (
          <span className="ml-2 font-normal text-ink-subtle">
            ({pending.length} venter)
          </span>
        )}
      </h3>

      {requestsQuery.isLoading && (
        <p role="status" className="mt-3 text-sm text-ink-subtle">
          Henter ansøgninger…
        </p>
      )}

      {requestsQuery.isError && (
        <div
          role="alert"
          className="mt-3 rounded border border-danger-line bg-danger-surface p-3 text-sm text-danger-strong"
        >
          Ansøgningerne kunne ikke hentes.
          <button
            type="button"
            onClick={() => requestsQuery.refetch()}
            className="ml-2 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {decisionError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {decisionError}
        </p>
      )}

      {requestsQuery.data && requests.length === 0 && (
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
                    {requestDateFormatter.format(new Date(request.created_at))}
                  </p>
                  {request.message && (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-ink">
                      {request.message}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(request, 'reject')}
                    disabled={deciding}
                    aria-label={`Afvis ${request.full_name}`}
                    className="min-h-11 rounded border border-danger-line-strong px-3 py-2 text-sm text-danger disabled:opacity-60"
                  >
                    Afvis
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(request, 'approve')}
                    disabled={deciding}
                    aria-label={`Godkend ${request.full_name}`}
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
          <ul
            className="mt-2 flex flex-col gap-1"
            aria-label="Godkendte gæster"
          >
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
