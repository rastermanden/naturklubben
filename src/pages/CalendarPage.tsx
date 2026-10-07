import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AttendanceSection } from '../features/calendar/AttendanceSection'
import { GuestRequestsSection } from '../features/calendar/GuestRequestsSection'
import { EventTasksSection } from '../features/calendar/EventTasksSection'
import { EventForm } from '../features/calendar/EventForm'
import { downloadIcal } from '../features/calendar/ical'
import { SubscribeDialog } from '../features/calendar/SubscribeDialog'
import {
  useEvents,
  type CalendarEvent,
  type EventInput,
} from '../features/calendar/useEvents'
import { isPastEvent } from '../features/calendar/pastEvents'
import { useEventPhotoCount } from '../features/calendar/useEventPhotoCount'
import { eventAlbumPath } from '../features/gallery/gallerySearchParams'
import {
  dayPosition,
  eventDays,
  formatEndTime,
  formatEventTimeShort,
  formatEventWhen,
  type DayPosition,
} from '../features/calendar/eventDays'
import {
  usePastEvents,
  usePastMonthEvents,
} from '../features/calendar/usePastEvents'
import {
  announcePromotion,
  notifyPromotedMembers,
} from '../features/calendar/announceWaitlist'
import { useAuth } from '../features/auth/useAuth'
import { useIsAdmin } from '../features/admin/useIsAdmin'
import { useProfilesMap } from '../features/chat/useProfilesMap'
import { useDialogFocus } from '../hooks/useDialogFocus'

// Feed-URL til live iCal-abonnement. Udledes af SUPABASE_URL så der ikke er
// brug for en ekstra env-variabel. Deles som https — se SubscribeDialog for
// hvorfor webcal:// ikke er den primære vej.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const CALENDAR_FEED_URL = supabaseUrl
  ? `${supabaseUrl}/functions/v1/calendar-feed`
  : null

const timeFormatter = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
})
const monthFormatter = new Intl.DateTimeFormat('da-DK', {
  month: 'long',
  year: 'numeric',
})
const weekDays = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthCells(month: Date) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const numberOfDays = new Date(year, monthIndex + 1, 0).getDate()

  return [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from(
      { length: numberOfDays },
      (_, index) => new Date(year, monthIndex, index + 1),
    ),
  ]
}

function PublicBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded bg-accent-soft px-1.5 py-0.5 text-[0.7rem] font-medium text-on-accent ${className}`}
      title="Åben for ikke-medlemmer"
    >
      Offentlig
    </span>
  )
}

// En flerdagstur tegnes som én bjælke hen over dagene: de indre kanter går
// helt ud til cellens kant (cellen har p-2), så bjælken kun brydes af
// gitterlinjen og ved ugeskift.
const chipShape: Record<DayPosition, string> = {
  single: 'rounded',
  first: 'rounded-l -mr-2',
  middle: '-mx-2',
  last: 'rounded-r -ml-2',
}

function MonthEventChip({
  event,
  position,
  onOpen,
}: {
  event: CalendarEvent
  position: DayPosition
  onOpen: () => void
}) {
  const endTime = formatEndTime(event)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`bg-surface-raised px-2 py-1 text-left text-xs text-ink hover:bg-surface-strong ${chipShape[position]} ${
        isPastEvent(event) ? 'opacity-60' : ''
      }`}
    >
      {(position === 'single' || position === 'first') && (
        <>
          <span className="font-medium">
            {timeFormatter.format(new Date(event.start_at))}
          </span>{' '}
        </>
      )}
      {event.title}
      {position === 'first' && <span aria-hidden="true"> →</span>}
      {position === 'middle' && (
        <span className="text-ink-subtle"> (fortsat)</span>
      )}
      {position === 'last' && endTime && (
        <span className="text-ink-subtle"> · til kl. {endTime}</span>
      )}
      {event.is_public && position !== 'middle' && position !== 'last' && (
        <PublicBadge className="ml-1" />
      )}
    </button>
  )
}

function EventCard({
  event,
  past = false,
  onOpen,
}: {
  event: CalendarEvent
  past?: boolean
  onOpen: () => void
}) {
  const start = new Date(event.start_at)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-20 items-center gap-4 rounded-lg border border-line p-4 text-left"
    >
      <span className="flex w-14 shrink-0 flex-col items-center rounded bg-surface-sunken px-2 py-1 text-ink-body">
        <span className="text-xs uppercase">
          {start.toLocaleDateString('da-DK', {
            month: 'short',
          })}
        </span>
        <span className="text-xl font-semibold">{start.getDate()}</span>
        {past && <span className="text-xs">{start.getFullYear()}</span>}
      </span>
      <span>
        <span className="block font-medium text-ink">
          {event.title}
          {event.is_public && <PublicBadge className="ml-2" />}
        </span>
        <span className="text-sm text-ink-subtle">
          {formatEventTimeShort(event)}
          {event.location && ` · ${event.location}`}
        </span>
      </span>
    </button>
  )
}

function EventDetails({
  event,
  userId,
  canEdit,
  canDelete,
  deleting,
  error,
  onClose,
  onEdit,
  onDelete,
  onIcal,
}: {
  event: CalendarEvent
  userId: string
  canEdit: boolean
  canDelete: boolean
  deleting: boolean
  error: string | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onIcal: () => void
}) {
  const past = isPastEvent(event)
  // En fejl her skjuler bare linket -- billederne er et ekstra, ikke noget,
  // dialogen skal vælte over.
  const photoCount = useEventPhotoCount(event.id).data ?? 0
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  })

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-title"
      tabIndex={-1}
    >
      <article className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="event-title" className="text-xl font-semibold text-ink-body">
            {event.title}
            {event.is_public && <PublicBadge className="ml-2 align-middle" />}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-2xl text-ink-body"
          >
            ×
          </button>
        </div>

        {past && (
          <p className="mt-2 inline-block rounded bg-surface-sunken px-2 py-1 text-sm text-ink-muted">
            Afholdt
          </p>
        )}

        <dl className="mt-4 grid gap-3 text-ink">
          <div>
            <dt className="text-sm font-medium text-ink-subtle">Tidspunkt</dt>
            <dd>{formatEventWhen(event)}</dd>
          </div>
          {event.location && (
            <div>
              <dt className="text-sm font-medium text-ink-subtle">Sted</dt>
              <dd>{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div>
              <dt className="text-sm font-medium text-ink-subtle">
                Beskrivelse
              </dt>
              <dd className="whitespace-pre-wrap">{event.description}</dd>
            </div>
          )}
        </dl>

        {photoCount > 0 && (
          <Link
            to={eventAlbumPath(event.id)}
            className="mt-4 inline-flex min-h-11 items-center rounded border border-accent-soft px-4 py-2 text-ink-muted hover:bg-surface-sunken"
          >
            Se billeder ({photoCount})
          </Link>
        )}

        <AttendanceSection
          event={event}
          userId={userId}
          canManage={canEdit}
          readOnly={past}
        />

        {/* Gæsteansøgninger og opgaver handler om at få turen til at ske --
            efter den er afholdt, er der intet at tage stilling til. */}
        {!past && (
          <>
            <GuestRequestsSection
              eventId={event.id}
              isPublic={event.is_public}
              canManage={canEdit}
              event={event}
            />

            <EventTasksSection eventId={event.id} userId={userId} />
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {past ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={onIcal}
              className="min-h-11 rounded border border-accent-soft px-4 py-2 text-ink-muted hover:bg-surface-sunken"
            >
              Tilføj til kalender
            </button>
          )}

          {(canEdit || canDelete) && (
            <div className="flex gap-3">
              {canDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="min-h-11 rounded border border-danger-line-strong px-4 py-2 text-danger disabled:opacity-60"
                >
                  {deleting ? 'Sletter…' : 'Slet'}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="min-h-11 rounded bg-accent px-4 py-2 text-white"
                >
                  Redigér
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

// Beskeden til den næste visning af /kalender: sat før navigationen, taget
// én gang af den side, der starter forfra.
let pendingEventMissingNotice = false

function CalendarPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { isAdmin } = useIsAdmin()
  const { eventsQuery, createEvent, updateEvent, deleteEvent } =
    useEvents(userId)
  const profilesQuery = useProfilesMap()
  // /kalender/<id> -- fra en notifikation (#216) eller et delt link -- åbner
  // begivenheden, så snart listen er hentet. Den er ikke state: at lukke
  // dialogen er at gå tilbage til /kalender, så et tryk på "tilbage" ikke
  // åbner den igen. Navigationen sker først, når dialogen eller formularen
  // faktisk lukkes: hver navigation starter siden forfra (RouteErrorBoundary),
  // så en formular, der åbnes i samme åndedrag, ville forsvinde igen.
  const { eventId: routedEventId } = useParams()
  const navigate = useNavigate()
  const routedEvent = routedEventId
    ? (eventsQuery.data?.find((event) => event.id === routedEventId) ?? null)
    : null
  // En notifikation, der trykkes på, efter begivenheden er forbi eller
  // slettet, peger på noget, listen ikke længere har. Så siges det, og URL'en
  // erstattes med /kalender.
  const routedEventMissing = Boolean(
    routedEventId && eventsQuery.data && !routedEvent,
  )
  const [eventMissing] = useState(() => pendingEventMissingNotice)
  useEffect(() => {
    pendingEventMissingNotice = routedEventMissing
    if (routedEventMissing) navigate('/kalender', { replace: true })
  }, [routedEventMissing, navigate])
  // null = "ikke valgt": den måned, den åbnede begivenhed ligger i, ellers
  // den nuværende.
  const [chosenMonth, setChosenMonth] = useState<Date | null>(null)
  const visibleMonth =
    chosenMonth ??
    (routedEvent
      ? monthStart(new Date(routedEvent.start_at))
      : monthStart(new Date()))
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<
    CalendarEvent | 'new' | null
  >(null)
  const openEvent = editingEvent ? null : (selectedEvent ?? routedEvent)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  // Tidligere begivenheder (#257): månedsvisningen henter den viste måneds
  // dage før i dag, listen på mobil først, når man beder om den.
  const pastMonthQuery = usePastMonthEvents(visibleMonth)
  const [showPast, setShowPast] = useState(false)
  const pastEventsQuery = usePastEvents(showPast)
  const pastEvents = pastEventsQuery.data?.pages.flat() ?? []

  // En flerdagstur står på hver af sine dage (#259). En tur, der er i gang,
  // kommer både med månedens tidligere dage og med de kommende -- én gang.
  const eventsByDay = useMemo(() => {
    const unique = new Map<string, CalendarEvent>()
    for (const event of [
      ...(pastMonthQuery.data ?? []),
      ...(eventsQuery.data ?? []),
    ]) {
      unique.set(event.id, event)
    }
    const grouped = new Map<string, CalendarEvent[]>()
    const byStart = [...unique.values()].sort((a, b) =>
      a.start_at.localeCompare(b.start_at),
    )
    for (const event of byStart) {
      for (const day of eventDays(event)) {
        const key = dateKey(day)
        grouped.set(key, [...(grouped.get(key) ?? []), event])
      }
    }
    return grouped
  }, [pastMonthQuery.data, eventsQuery.data])

  function moveMonth(offset: number) {
    setChosenMonth(
      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1),
    )
  }

  function closeDetails() {
    setSelectedEvent(null)
    if (routedEventId) navigate('/kalender', { replace: true })
  }

  function openForm(event: CalendarEvent | 'new') {
    setMutationError(null)
    setSelectedEvent(null)
    setEditingEvent(event)
  }

  function closeForm() {
    setEditingEvent(null)
    if (routedEventId) navigate('/kalender', { replace: true })
  }

  function saveEvent(input: EventInput) {
    setMutationError(null)
    const editing = editingEvent
    const mutation =
      editing === 'new' || editing === null
        ? createEvent.mutateAsync(input).then(() => [] as string[])
        : updateEvent.mutateAsync({ event: editing, input })

    mutation
      .then((promoted) => {
        closeForm()
        // Et hævet loft gav plads til nogen fra ventelisten -- sig det til
        // dem i chatten, ligesom når en plads bliver ledig.
        if (editing && editing !== 'new' && promoted.length > 0) {
          void announcePromotion(
            userId,
            'capRaised',
            input.title,
            promoted,
            profilesQuery.data,
          )
          void notifyPromotedMembers(editing.id, promoted)
        }
      })
      .catch(() =>
        setMutationError(
          'Begivenheden kunne ikke gemmes. Prøv igen om et øjeblik.',
        ),
      )
  }

  function removeSelectedEvent() {
    if (!openEvent || !window.confirm(`Vil du slette "${openEvent.title}"?`)) {
      return
    }

    setMutationError(null)
    deleteEvent
      .mutateAsync(openEvent.id)
      .then(() => closeDetails())
      .catch(() =>
        setMutationError(
          'Begivenheden kunne ikke slettes. Prøv igen om et øjeblik.',
        ),
      )
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink-body">Kalender</h1>
          <p className="mt-1 text-ink-subtle">
            Klubbens ture og arrangementer.{' '}
            <Link to="/kalender/offentlig" className="underline">
              Se den offentlige kalender
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {CALENDAR_FEED_URL && (
            <button
              type="button"
              onClick={() => setSubscribeOpen(true)}
              className="min-h-11 rounded border border-accent-soft px-5 py-2 text-ink-muted hover:bg-surface-sunken"
            >
              Abonnér på kalender
            </button>
          )}
          <button
            type="button"
            onClick={() => openForm('new')}
            className="min-h-11 rounded bg-accent px-5 py-2 text-white"
          >
            Opret begivenhed
          </button>
        </div>
      </div>

      {eventMissing && (
        <p role="status" className="mb-4 text-ink-subtle">
          Begivenheden er forbi eller slettet.
        </p>
      )}

      {eventsQuery.isLoading && (
        <p className="py-12 text-center text-ink-subtle">Henter kalender…</p>
      )}

      {eventsQuery.isError && (
        <div
          role="alert"
          className="rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
        >
          Kalenderen kunne ikke hentes.
          <button
            type="button"
            onClick={() => eventsQuery.refetch()}
            className="ml-2 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {eventsQuery.data && (
        <>
          <section className="hidden md:block" aria-label="Månedsvisning">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="Forrige måned"
                className="min-h-11 rounded border border-line-strong px-4 text-ink-body disabled:opacity-30"
              >
                ←
              </button>
              <h2 className="text-xl font-semibold capitalize text-ink-body">
                {monthFormatter.format(visibleMonth)}
              </h2>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="Næste måned"
                className="min-h-11 rounded border border-line-strong px-4 text-ink-body"
              >
                →
              </button>
            </div>

            {pastMonthQuery.isError && (
              <div
                role="alert"
                className="mb-4 rounded border border-danger-line bg-danger-surface p-3 text-sm text-danger-strong"
              >
                De tidligere begivenheder i måneden kunne ikke hentes.
                <button
                  type="button"
                  onClick={() => pastMonthQuery.refetch()}
                  className="ml-2 underline"
                >
                  Prøv igen
                </button>
              </div>
            )}

            <div className="grid grid-cols-7 border-l border-t border-line">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="border-b border-r border-line bg-surface-sunken p-2 text-center text-sm font-medium text-ink-muted"
                >
                  {day}
                </div>
              ))}
              {monthCells(visibleMonth).map((date, index) => (
                <div
                  key={date ? dateKey(date) : `empty-${index}`}
                  className="min-h-32 border-b border-r border-line p-2"
                >
                  {date && (
                    <>
                      <span className="text-sm font-medium text-ink-body">
                        {date.getDate()}
                      </span>
                      <div className="mt-1 flex flex-col gap-1">
                        {(eventsByDay.get(dateKey(date)) ?? []).map((event) => (
                          <MonthEventChip
                            key={event.id}
                            event={event}
                            position={dayPosition(event, date)}
                            onOpen={() => {
                              setMutationError(null)
                              setSelectedEvent(event)
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="md:hidden" aria-label="Kommende begivenheder">
            <h2 className="sr-only">Kommende begivenheder</h2>
            {eventsQuery.data.length === 0 ? (
              <p className="rounded bg-surface-sunken p-5 text-ink-muted">
                Der er ingen kommende begivenheder endnu.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {eventsQuery.data.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onOpen={() => {
                      setMutationError(null)
                      setSelectedEvent(event)
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section
            className="mt-8 md:hidden"
            aria-labelledby="past-events-heading"
          >
            <h2
              id="past-events-heading"
              className="text-lg font-semibold text-ink-body"
            >
              Tidligere begivenheder
            </h2>
            {!showPast ? (
              <button
                type="button"
                onClick={() => setShowPast(true)}
                className="mt-3 min-h-11 rounded border border-accent-soft px-4 py-2 text-ink-muted hover:bg-surface-sunken"
              >
                Vis tidligere begivenheder
              </button>
            ) : pastEventsQuery.isLoading ? (
              <p role="status" className="mt-3 text-ink-subtle">
                Henter tidligere begivenheder…
              </p>
            ) : pastEventsQuery.isError && pastEvents.length === 0 ? (
              <div
                role="alert"
                className="mt-3 rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
              >
                De tidligere begivenheder kunne ikke hentes.
                <button
                  type="button"
                  onClick={() => pastEventsQuery.refetch()}
                  className="ml-2 underline"
                >
                  Prøv igen
                </button>
              </div>
            ) : pastEvents.length === 0 ? (
              <p className="mt-3 rounded bg-surface-sunken p-5 text-ink-muted">
                Der er ingen tidligere begivenheder.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-3">
                  {pastEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      past
                      onOpen={() => {
                        setMutationError(null)
                        setSelectedEvent(event)
                      }}
                    />
                  ))}
                </div>
                {pastEventsQuery.isFetchNextPageError && (
                  <p role="alert" className="mt-3 text-sm text-danger">
                    Flere begivenheder kunne ikke hentes. Prøv igen.
                  </p>
                )}
                {pastEventsQuery.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => void pastEventsQuery.fetchNextPage()}
                    disabled={pastEventsQuery.isFetchingNextPage}
                    className="mt-3 min-h-11 w-full rounded border border-accent-soft px-4 py-2 text-ink-muted hover:bg-surface-sunken disabled:opacity-60"
                  >
                    {pastEventsQuery.isFetchingNextPage
                      ? 'Henter…'
                      : 'Indlæs flere'}
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}

      {openEvent && (
        <EventDetails
          event={openEvent}
          userId={userId}
          canEdit={openEvent.created_by === userId || isAdmin}
          canDelete={openEvent.created_by === userId}
          deleting={deleteEvent.isPending}
          error={mutationError}
          onClose={closeDetails}
          onEdit={() => openForm(openEvent)}
          onDelete={removeSelectedEvent}
          onIcal={() =>
            downloadIcal(
              [openEvent],
              `${openEvent.title.replace(/[/\\:*?"<>|]/g, '-')}.ics`,
            )
          }
        />
      )}

      {subscribeOpen && CALENDAR_FEED_URL && (
        <SubscribeDialog
          feedUrl={CALENDAR_FEED_URL}
          onClose={() => setSubscribeOpen(false)}
        />
      )}

      {editingEvent && (
        <EventForm
          event={editingEvent === 'new' ? undefined : editingEvent}
          submitting={createEvent.isPending || updateEvent.isPending}
          error={mutationError}
          onSubmit={saveEvent}
          onCancel={closeForm}
        />
      )}
    </main>
  )
}

export default CalendarPage
