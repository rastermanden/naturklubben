import { useState } from 'react'
import { toFriendlyGuestDecisionError } from './guestRequestErrors'
import {
  useEventGuestRequests,
  type EventGuestRequest,
  type GuestNotificationDelivery,
} from './useEventGuests'

const requestDateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
})

interface GuestRequestsSectionProps {
  eventId: string
  /** Kun arrangøren og admins kan læse ansøgningerne (RLS). */
  canManage: boolean
}

function DeliveryStatus({
  request,
  onRetry,
  retrying,
}: {
  request: EventGuestRequest
  onRetry: () => void
  retrying: boolean
}) {
  switch (request.decision_notification_status) {
    case 'sent':
      return (
        <span className="text-xs text-ink-subtle">Svar sendt på e-mail</span>
      )
    case 'pending':
    case 'sending':
      return (
        <span role="status" className="text-xs text-ink-subtle">
          Sender svar på e-mail…
        </span>
      )
    case 'failed':
      return (
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span role="alert" className="text-danger">
            {request.decision_notification_error ?? 'Mailen kunne ikke sendes.'}
          </span>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="underline disabled:opacity-60"
          >
            {retrying ? 'Sender…' : 'Send igen'}
          </button>
        </span>
      )
    default:
      return null
  }
}

/**
 * Arrangørens overblik over gæsteansøgninger på en åben begivenhed (#224):
 * ventende ansøgninger med godkend/afvis, godkendte gæster og status på
 * svaret til hver ansøger. Renderes kun for offentlige begivenheder, og kun
 * arrangør/admin får data tilbage.
 */
export function GuestRequestsSection({
  eventId,
  canManage,
}: GuestRequestsSectionProps) {
  const { requestsQuery, approveRequest, rejectRequest, retryNotification } =
    useEventGuestRequests(eventId, canManage)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [lastDelivery, setLastDelivery] =
    useState<GuestNotificationDelivery | null>(null)

  if (!canManage) return null

  const requests = requestsQuery.data ?? []
  const pending = requests.filter((request) => request.status === 'pending')
  const approved = requests.filter((request) => request.status === 'approved')
  const rejected = requests.filter((request) => request.status === 'rejected')
  const deciding = approveRequest.isPending || rejectRequest.isPending

  function decide(request: EventGuestRequest, decision: 'approve' | 'reject') {
    setDecisionError(null)
    setLastDelivery(null)
    const mutation = decision === 'approve' ? approveRequest : rejectRequest
    mutation
      .mutateAsync(request.id)
      .then((delivery) => setLastDelivery(delivery))
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

      {lastDelivery?.status === 'failed' && lastDelivery.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {lastDelivery.error}
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
                <DeliveryStatus
                  request={request}
                  retrying={
                    retryNotification.isPending &&
                    retryNotification.variables === request.id
                  }
                  onRetry={() => retryNotification.mutate(request.id)}
                />
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
                <DeliveryStatus
                  request={request}
                  retrying={
                    retryNotification.isPending &&
                    retryNotification.variables === request.id
                  }
                  onRetry={() => retryNotification.mutate(request.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
