import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { GuestRequestForm } from '../features/calendar/GuestRequestForm'
import {
  usePublicEvents,
  type PublicEvent,
} from '../features/calendar/usePublicEvents'

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
})

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function PublicEventCard({
  event,
  onApply,
}: {
  event: PublicEvent
  onApply: () => void
}) {
  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : null
  const headingId = `public-event-${event.id}`

  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:flex-row sm:items-start sm:gap-5"
      >
        <span className="flex w-16 shrink-0 flex-col items-center self-start rounded bg-surface-sunken px-2 py-2 text-ink-body">
          <span className="text-xs uppercase">
            {start.toLocaleDateString('da-DK', { month: 'short' })}
          </span>
          <span className="text-2xl font-semibold">{start.getDate()}</span>
        </span>

        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-lg font-semibold text-ink-body">
            {event.title}
          </h2>
          <p className="mt-1 text-sm text-ink-subtle">
            {capitalize(dateFormatter.format(start))}
            {`, kl. ${timeFormatter.format(start)}`}
            {end && ` – ${timeFormatter.format(end)}`}
            {event.location && ` · ${event.location}`}
          </p>
          {event.description && (
            <p className="mt-2 whitespace-pre-wrap text-ink">
              {event.description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onApply}
          className="min-h-11 shrink-0 self-start rounded bg-accent px-4 py-2 text-white hover:bg-accent-hover"
        >
          Søg om at deltage
        </button>
      </article>
    </li>
  )
}

/**
 * Den offentlige kalender (#224): kan ses uden login og viser kun de
 * begivenheder, en arrangør har åbnet for ikke-medlemmer.
 */
function PublicCalendarPage() {
  const { session } = useAuth()
  const eventsQuery = usePublicEvents()
  const [applyingTo, setApplyingTo] = useState<PublicEvent | null>(null)
  const events = eventsQuery.data ?? []

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-ink-body">
          Åbne ture og arrangementer
        </h1>
        <p className="mt-2 text-ink-muted">
          Her er de af Naturklubbens begivenheder, hvor du er velkommen, selv om
          du ikke er medlem. Søg om at deltage -- du hører fra en arrangør pr.
          e-mail.
        </p>
        {session ? (
          <p className="mt-2 text-sm text-ink-subtle">
            <Link to="/kalender" className="underline">
              Til medlemskalenderen
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-subtle">
            Medlem?{' '}
            <Link to="/login" className="underline">
              Log ind
            </Link>{' '}
            for at se hele kalenderen.
          </p>
        )}
      </div>

      {eventsQuery.isLoading && (
        <p role="status" className="py-12 text-center text-ink-subtle">
          Henter begivenheder…
        </p>
      )}

      {eventsQuery.isError && (
        <div
          role="alert"
          className="rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
        >
          Begivenhederne kunne ikke hentes.
          <button
            type="button"
            onClick={() => eventsQuery.refetch()}
            className="ml-2 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {eventsQuery.data && events.length === 0 && (
        <p className="rounded bg-surface-sunken p-5 text-ink-muted">
          Der er ingen åbne begivenheder lige nu. Kig forbi igen senere.
        </p>
      )}

      {events.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Åbne begivenheder">
          {events.map((event) => (
            <PublicEventCard
              key={event.id}
              event={event}
              onApply={() => setApplyingTo(event)}
            />
          ))}
        </ul>
      )}

      {applyingTo && (
        <GuestRequestForm
          event={applyingTo}
          onClose={() => setApplyingTo(null)}
        />
      )}
    </main>
  )
}

export default PublicCalendarPage
