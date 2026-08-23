import { useMemo, useState } from 'react'
import { AttendanceSection } from '../features/calendar/AttendanceSection'
import { EventForm } from '../features/calendar/EventForm'
import { downloadIcal } from '../features/calendar/ical'
import {
  useEvents,
  type CalendarEvent,
  type EventInput,
} from '../features/calendar/useEvents'
import { useAuth } from '../features/auth/useAuth'

// Feed-URL til live iCal-abonnement (webcal://). Udledes af SUPABASE_URL så
// der ikke er brug for en ekstra env-variabel.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const CALENDAR_FEED_URL = supabaseUrl
  ? `${supabaseUrl}/functions/v1/calendar-feed`
  : null

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
const monthFormatter = new Intl.DateTimeFormat('da-DK', {
  month: 'long',
  year: 'numeric',
})
const weekDays = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
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

function EventDetails({
  event,
  userId,
  isOwner,
  deleting,
  error,
  onClose,
  onEdit,
  onDelete,
  onIcal,
}: {
  event: CalendarEvent
  userId: string
  isOwner: boolean
  deleting: boolean
  error: string | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onIcal: () => void
}) {
  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : null

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-title"
    >
      <article className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="event-title" className="text-xl font-semibold text-green-900">
            {event.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-2xl text-green-900"
          >
            ×
          </button>
        </div>

        <dl className="mt-4 grid gap-3 text-green-950">
          <div>
            <dt className="text-sm font-medium text-green-700">Tidspunkt</dt>
            <dd>
              <span className="capitalize">{dateFormatter.format(start)}</span>
              {`, kl. ${timeFormatter.format(start)}`}
              {end && ` – ${timeFormatter.format(end)}`}
            </dd>
          </div>
          {event.location && (
            <div>
              <dt className="text-sm font-medium text-green-700">Sted</dt>
              <dd>{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div>
              <dt className="text-sm font-medium text-green-700">
                Beskrivelse
              </dt>
              <dd className="whitespace-pre-wrap">{event.description}</dd>
            </div>
          )}
        </dl>

        <AttendanceSection eventId={event.id} userId={userId} />

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onIcal}
            className="min-h-11 rounded border border-green-700 px-4 py-2 text-green-800 hover:bg-green-50"
          >
            Tilføj til kalender
          </button>

          {isOwner && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="min-h-11 rounded border border-red-700 px-4 py-2 text-red-700 disabled:opacity-60"
              >
                {deleting ? 'Sletter…' : 'Slet'}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="min-h-11 rounded bg-green-800 px-4 py-2 text-white"
              >
                Redigér
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

function CalendarPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { eventsQuery, createEvent, updateEvent, deleteEvent } =
    useEvents(userId)
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<
    CalendarEvent | 'new' | null
  >(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()
    for (const event of eventsQuery.data ?? []) {
      const key = dateKey(new Date(event.start_at))
      grouped.set(key, [...(grouped.get(key) ?? []), event])
    }
    return grouped
  }, [eventsQuery.data])

  const currentMonth = new Date()
  currentMonth.setDate(1)
  currentMonth.setHours(0, 0, 0, 0)
  const canGoBack = visibleMonth > currentMonth

  function moveMonth(offset: number) {
    setVisibleMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + offset, 1),
    )
  }

  function openForm(event: CalendarEvent | 'new') {
    setMutationError(null)
    setSelectedEvent(null)
    setEditingEvent(event)
  }

  function saveEvent(input: EventInput) {
    setMutationError(null)
    const mutation =
      editingEvent === 'new'
        ? createEvent.mutateAsync(input)
        : updateEvent.mutateAsync({ id: editingEvent!.id, input })

    mutation
      .then(() => setEditingEvent(null))
      .catch(() =>
        setMutationError(
          'Begivenheden kunne ikke gemmes. Prøv igen om et øjeblik.',
        ),
      )
  }

  function removeSelectedEvent() {
    if (
      !selectedEvent ||
      !window.confirm(`Vil du slette "${selectedEvent.title}"?`)
    ) {
      return
    }

    setMutationError(null)
    deleteEvent
      .mutateAsync(selectedEvent.id)
      .then(() => setSelectedEvent(null))
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
          <h1 className="text-3xl font-semibold text-green-900">Kalender</h1>
          <p className="mt-1 text-green-700">
            Klubbens kommende ture og arrangementer.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {CALENDAR_FEED_URL && (
            <a
              href={CALENDAR_FEED_URL.replace(/^https?:\/\//, 'webcal://')}
              className="inline-flex min-h-11 items-center rounded border border-green-700 px-5 py-2 text-green-800 hover:bg-green-50"
            >
              Abonnér på kalender
            </a>
          )}
          {eventsQuery.data && eventsQuery.data.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadIcal(eventsQuery.data, 'naturklubben-kalender.ics')
              }
              className="min-h-11 rounded border border-green-700 px-5 py-2 text-green-800 hover:bg-green-50"
            >
              Eksportér kalender
            </button>
          )}
          <button
            type="button"
            onClick={() => openForm('new')}
            className="min-h-11 rounded bg-green-800 px-5 py-2 text-white"
          >
            Opret begivenhed
          </button>
        </div>
      </div>

      {eventsQuery.isLoading && (
        <p className="py-12 text-center text-green-700">Henter kalender…</p>
      )}

      {eventsQuery.isError && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-red-800"
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
                disabled={!canGoBack}
                aria-label="Forrige måned"
                className="min-h-11 rounded border border-green-300 px-4 text-green-900 disabled:opacity-30"
              >
                ←
              </button>
              <h2 className="text-xl font-semibold capitalize text-green-900">
                {monthFormatter.format(visibleMonth)}
              </h2>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="Næste måned"
                className="min-h-11 rounded border border-green-300 px-4 text-green-900"
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 border-l border-t border-green-200">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="border-b border-r border-green-200 bg-green-50 p-2 text-center text-sm font-medium text-green-800"
                >
                  {day}
                </div>
              ))}
              {monthCells(visibleMonth).map((date, index) => (
                <div
                  key={date ? dateKey(date) : `empty-${index}`}
                  className="min-h-32 border-b border-r border-green-200 p-2"
                >
                  {date && (
                    <>
                      <span className="text-sm font-medium text-green-900">
                        {date.getDate()}
                      </span>
                      <div className="mt-1 flex flex-col gap-1">
                        {(eventsByDay.get(dateKey(date)) ?? []).map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => {
                              setMutationError(null)
                              setSelectedEvent(event)
                            }}
                            className="rounded bg-green-100 px-2 py-1 text-left text-xs text-green-950 hover:bg-green-200"
                          >
                            <span className="font-medium">
                              {timeFormatter.format(new Date(event.start_at))}
                            </span>{' '}
                            {event.title}
                          </button>
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
              <p className="rounded bg-green-50 p-5 text-green-800">
                Der er ingen kommende begivenheder endnu.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {eventsQuery.data.map((event) => {
                  const start = new Date(event.start_at)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        setMutationError(null)
                        setSelectedEvent(event)
                      }}
                      className="flex min-h-20 items-center gap-4 rounded-lg border border-green-200 p-4 text-left"
                    >
                      <span className="flex w-14 shrink-0 flex-col items-center rounded bg-green-50 px-2 py-1 text-green-900">
                        <span className="text-xs uppercase">
                          {start.toLocaleDateString('da-DK', {
                            month: 'short',
                          })}
                        </span>
                        <span className="text-xl font-semibold">
                          {start.getDate()}
                        </span>
                      </span>
                      <span>
                        <span className="block font-medium text-green-950">
                          {event.title}
                        </span>
                        <span className="text-sm text-green-700">
                          kl. {timeFormatter.format(start)}
                          {event.location && ` · ${event.location}`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          userId={userId}
          isOwner={selectedEvent.created_by === userId}
          deleting={deleteEvent.isPending}
          error={mutationError}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => openForm(selectedEvent)}
          onDelete={removeSelectedEvent}
          onIcal={() =>
            downloadIcal(
              [selectedEvent],
              `${selectedEvent.title.replace(/[/\\:*?"<>|]/g, '-')}.ics`,
            )
          }
        />
      )}

      {editingEvent && (
        <EventForm
          event={editingEvent === 'new' ? undefined : editingEvent}
          submitting={createEvent.isPending || updateEvent.isPending}
          error={mutationError}
          onSubmit={saveEvent}
          onCancel={() => setEditingEvent(null)}
        />
      )}
    </main>
  )
}

export default CalendarPage
