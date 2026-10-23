import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation } from 'convex/react'
import type { Id } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'
import { downloadIcal } from '../../lib/ical'
import { AttendanceSection } from '../features/calendar/AttendanceSection'
import { EventForm } from '../features/calendar/EventForm'
import { EventTasksSection } from '../features/calendar/EventTasksSection'
import { GuestRequestsSection } from '../features/calendar/GuestRequestsSection'
import { SubscribeDialog } from '../features/calendar/SubscribeDialog'
import { calendarFeedUrl } from '../features/calendar/feedUrl'
import { toFriendlyCalendarError } from '../features/calendar/guestRequestErrors'
import {
  dayPosition,
  eventDays,
  formatEndTime,
  formatEventTimeShort,
  formatEventWhen,
  type DayPosition,
} from '../features/calendar/eventDays'
import { isPastEvent, startOfDay } from '../features/calendar/pastEvents'
import type {
  CalendarEvent,
  EventInput,
  EventWithResponse,
} from '../features/calendar/types'
import {
  useEvent,
  useMonthEvents,
  usePastEvents,
  useUpcomingEvents,
} from '../features/calendar/useEvents'

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

// En flerdagstur tegnes som én bjælke hen over dagene: de indre kanter går helt
// ud til cellens kant (cellen har p-2), så bjælken kun brydes af gitterlinjen.
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
            {timeFormatter.format(new Date(event.startAt))}
          </span>{' '}
        </>
      )}
      {event.title}
      {position === 'first' && <span aria-hidden="true"> →</span>}
      {position === 'middle' && (
        <span className="text-ink-subtle"> (fortsat)</span>
      )}
      {position === 'last' && endTime !== null && (
        <span className="text-ink-subtle"> · til kl. {endTime}</span>
      )}
      {event.isPublic && position !== 'middle' && position !== 'last' && (
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
  const start = new Date(event.startAt)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-20 items-center gap-4 rounded-lg border border-line p-4 text-left"
    >
      <span className="flex w-14 shrink-0 flex-col items-center rounded bg-surface-sunken px-2 py-1 text-ink-body">
        <span className="text-xs uppercase">
          {start.toLocaleDateString('da-DK', { month: 'short' })}
        </span>
        <span className="text-xl font-semibold">{start.getDate()}</span>
        {past && <span className="text-xs">{start.getFullYear()}</span>}
      </span>
      <span>
        <span className="block font-medium text-ink">
          {event.title}
          {event.isPublic && <PublicBadge className="ml-2" />}
        </span>
        <span className="text-sm text-ink-subtle">
          {formatEventTimeShort(event)}
          {event.location !== null && ` · ${event.location}`}
          {event.maxParticipants !== null &&
            ` · ${event.attendingCount}/${event.maxParticipants} pladser`}
        </span>
      </span>
    </button>
  )
}

function EventDetails({
  event,
  deleting,
  error,
  onClose,
  onEdit,
  onDelete,
}: {
  event: EventWithResponse
  deleting: boolean
  error: string | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const past = isPastEvent(event)

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-title"
    >
      <article className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="event-title" className="text-xl font-semibold text-ink-body">
            {event.title}
            {event.isPublic && <PublicBadge className="ml-2 align-middle" />}
          </h2>
          <button
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
          {event.location !== null && (
            <div>
              <dt className="text-sm font-medium text-ink-subtle">Sted</dt>
              <dd>{event.location}</dd>
            </div>
          )}
          {event.description !== null && (
            <div>
              <dt className="text-sm font-medium text-ink-subtle">
                Beskrivelse
              </dt>
              <dd className="whitespace-pre-wrap">{event.description}</dd>
            </div>
          )}
        </dl>

        <AttendanceSection event={event} readOnly={past} />

        {/* Gæsteansøgninger og opgaver handler om at få turen til at ske --
            efter den er afholdt, er der intet at tage stilling til. */}
        {!past && (
          <>
            <GuestRequestsSection event={event} />
            <EventTasksSection eventId={event.id} />
          </>
        )}

        {error !== null && (
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
              onClick={() =>
                downloadIcal(
                  [
                    {
                      id: event.id,
                      title: event.title,
                      description: event.description,
                      location: event.location,
                      startAt: event.startAt,
                      endAt: event.endAt,
                    },
                  ],
                  `${event.title.replace(/[/\\:*?"<>|]/g, '-')}.ics`,
                )
              }
              className="min-h-11 rounded border border-accent-soft px-4 py-2 text-ink-muted hover:bg-surface-sunken"
            >
              Tilføj til kalender
            </button>
          )}

          {(event.canEdit || event.canDelete) && (
            <div className="flex gap-3">
              {event.canDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="min-h-11 rounded border border-danger-line-strong px-4 py-2 text-danger disabled:opacity-60"
                >
                  {deleting ? 'Sletter…' : 'Slet'}
                </button>
              )}
              {event.canEdit && (
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

/**
 * Kalenderen for medlemmer.
 *
 * `eventId` fra URL'en -- `/kalender/<id>`, fx fra en notifikation -- åbner
 * begivenheden. Det er ikke state: at lukke dialogen er at gå tilbage til
 * `/kalender`, så et tryk på "tilbage" ikke åbner den igen. Selve opslaget
 * ligger i en lille komponent, fordi en Convex-query ikke kan kaldes betinget.
 */
function CalendarPage() {
  const { eventId: routedEventId } = useParams()
  const navigate = useNavigate()
  const upcomingQuery = useUpcomingEvents()
  const createEvent = useMutation(api.calendar.createEvent)
  const updateEvent = useMutation(api.calendar.updateEvent)
  const deleteEvent = useMutation(api.calendar.deleteEvent)

  const dayStart = useMemo(() => startOfDay(new Date()), [])
  // null = "ikke valgt": den måned, den åbner i, er den nuværende.
  const [chosenMonth, setChosenMonth] = useState<Date | null>(null)
  const visibleMonth = chosenMonth ?? monthStart(new Date())
  const monthQuery = useMonthEvents(visibleMonth)

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pastQuery = usePastEvents(dayStart, 20, showPast)
  const upcoming = upcomingQuery ?? []
  const pastEvents = pastQuery ?? []
  const openEventId = editing === null ? (selectedEventId ?? routedEventId ?? null) : null

  // En flerdagstur står på hver af sine dage (#259). Månedsvisningen og de
  // kommende begivenheder kan indeholde den samme -- den tælles én gang.
  const eventsByDay = useMemo(() => {
    const unique = new Map<string, CalendarEvent>()
    for (const event of [...(monthQuery ?? []), ...upcoming]) {
      unique.set(event.id, event)
    }
    const grouped = new Map<string, CalendarEvent[]>()
    const byStart = [...unique.values()].sort((a, b) => a.startAt - b.startAt)
    for (const event of byStart) {
      for (const day of eventDays(event)) {
        const key = dateKey(day)
        grouped.set(key, [...(grouped.get(key) ?? []), event])
      }
    }
    return grouped
  }, [monthQuery, upcomingQuery])

  function moveMonth(offset: number) {
    setChosenMonth(
      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1),
    )
  }

  function closeDetails() {
    setSelectedEventId(null)
    if (routedEventId) navigate('/kalender', { replace: true })
  }

  function closeForm() {
    setEditing(null)
    if (routedEventId) navigate('/kalender', { replace: true })
  }

  async function saveEvent(input: EventInput) {
    setMutationError(null)
    setSaving(true)
    try {
      if (editing === null || editing === 'new') {
        await createEvent(input)
      } else {
        await updateEvent({ eventId: editing.id, ...input })
      }
      closeForm()
    } catch (cause) {
      setMutationError(toFriendlyCalendarError(cause))
    } finally {
      setSaving(false)
    }
  }

  async function removeEvent(eventId: Id<'events'>) {
    if (
      !window.confirm(
        'Vil du slette begivenheden? Tilmeldinger, opgaver og ansøgninger følger med. Handlingen kan ikke fortrydes.',
      )
    ) {
      return
    }
    setMutationError(null)
    setDeleting(true)
    try {
      await deleteEvent({ eventId })
      closeDetails()
    } catch (cause) {
      setMutationError(toFriendlyCalendarError(cause))
    } finally {
      setDeleting(false)
    }
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
          {calendarFeedUrl !== null && (
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
            onClick={() => {
              setMutationError(null)
              setSelectedEventId(null)
              setEditing('new')
            }}
            className="min-h-11 rounded bg-accent px-5 py-2 text-white"
          >
            Opret begivenhed
          </button>
        </div>
      </div>

      {upcomingQuery === undefined && (
        <p className="py-12 text-center text-ink-subtle">Henter kalender…</p>
      )}

      {upcomingQuery !== undefined && (
        <>
          <section className="hidden md:block" aria-label="Månedsvisning">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="Forrige måned"
                className="min-h-11 rounded border border-line-strong px-4 text-ink-body"
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
                              setSelectedEventId(event.id)
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
            {upcoming.length === 0 ? (
              <p className="rounded bg-surface-sunken p-5 text-ink-muted">
                Der er ingen kommende begivenheder endnu.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onOpen={() => {
                      setMutationError(null)
                      setSelectedEventId(event.id)
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
            ) : pastQuery === undefined ? (
              <p role="status" className="mt-3 text-ink-subtle">
                Henter tidligere begivenheder…
              </p>
            ) : pastEvents.length === 0 ? (
              <p className="mt-3 rounded bg-surface-sunken p-5 text-ink-muted">
                Der er ingen tidligere begivenheder.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    past
                    onOpen={() => {
                      setMutationError(null)
                      setSelectedEventId(event.id)
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {openEventId !== null && (
        <OpenEvent
          eventId={openEventId}
          deleting={deleting}
          error={mutationError}
          onClose={closeDetails}
          onEdit={(event) => {
            setMutationError(null)
            setSelectedEventId(null)
            setEditing(event)
          }}
          onDelete={removeEvent}
        />
      )}

      {subscribeOpen && calendarFeedUrl !== null && (
        <SubscribeDialog
          feedUrl={calendarFeedUrl}
          onClose={() => setSubscribeOpen(false)}
        />
      )}

      {editing !== null && (
        <EventForm
          event={editing === 'new' ? undefined : editing}
          submitting={saving}
          error={mutationError}
          onSubmit={(input) => void saveEvent(input)}
          onCancel={closeForm}
        />
      )}
    </main>
  )
}

/**
 * Slår den åbne begivenhed op. Ligger her, fordi en Convex-query ikke kan kaldes
 * betinget inde i `CalendarPage`, og fordi et link kan pege på noget, der er
 * slettet.
 */
function OpenEvent({
  eventId,
  deleting,
  error,
  onClose,
  onEdit,
  onDelete,
}: {
  eventId: string
  deleting: boolean
  error: string | null
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (eventId: Id<'events'>) => void
}) {
  const event = useEvent(eventId)

  if (event === undefined) {
    return (
      <p role="status" className="py-6 text-center text-ink-subtle">
        Henter begivenheden…
      </p>
    )
  }

  if (event === null) {
    return (
      <div
        role="alert"
        className="fixed inset-x-4 bottom-4 rounded border border-line bg-surface p-4 text-ink shadow-xl sm:left-1/2 sm:w-96 sm:-translate-x-1/2"
      >
        <p>Begivenheden er forbi eller slettet.</p>
        <button type="button" onClick={onClose} className="mt-2 underline">
          Luk
        </button>
      </div>
    )
  }

  return (
    <EventDetails
      event={event}
      deleting={deleting}
      error={error}
      onClose={onClose}
      onEdit={() => onEdit(event)}
      onDelete={() => onDelete(event.id)}
    />
  )
}

export default CalendarPage
