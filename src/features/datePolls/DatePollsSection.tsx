import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AdminSection } from '../admin/AdminSection'
import { EventForm } from '../calendar/EventForm'
import { useEvents, type EventInput } from '../calendar/useEvents'
import { useMembers } from '../members/useMembers'
import {
  MAX_DATE_OPTIONS,
  answerFor,
  answerLabels,
  bestOptionIds,
  countAnswers,
  draftOptionsPayload,
  formatOptionDate,
  missingResponders,
  sortPolls,
  sortedOptions,
  validateDraft,
  type DatePoll,
  type DatePollAnswer,
  type DraftOption,
} from './datePolls'
import { toFriendlyDatePollError, useDatePolls } from './useDatePolls'

const answers: DatePollAnswer[] = ['yes', 'maybe', 'no']

const answerStyles: Record<DatePollAnswer, string> = {
  yes: 'border-accent bg-accent text-white',
  maybe: 'border-line-strong bg-surface-raised text-ink-body',
  no: 'border-danger-line-strong bg-danger-surface text-danger-strong',
}

const emptyOption = (): DraftOption => ({ start: '', end: '' })

function NewDatePollForm({
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  submitting: boolean
  error: string | null
  onSubmit: (input: {
    title: string
    description: string | null
    options: { starts_at: string; ends_at: string | null }[]
  }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<DraftOption[]>([
    emptyOption(),
    emptyOption(),
  ])
  const [validationError, setValidationError] = useState<string | null>(null)

  function updateOption(index: number, patch: Partial<DraftOption>) {
    setOptions((current) =>
      current.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = validateDraft({ title, description, options })
    setValidationError(problem)
    if (problem) return
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      options: draftOptionsPayload(options),
    })
  }

  const shownError = validationError ?? error

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Ny datoafstemning"
      className="flex flex-col gap-3 rounded border border-line bg-surface-sunken p-3"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-body">
        Navn
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="Fx Svampetur i oktober"
          className="min-h-11 rounded border border-line-strong bg-surface px-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-body">
        Beskrivelse (valgfri)
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1000}
          rows={2}
          className="rounded border border-line-strong bg-surface px-3 py-2 font-normal"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink-body">
          Mulige datoer
        </legend>
        {options.map((option, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded bg-surface p-2 sm:flex-row sm:items-end"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-subtle">
              {`Dato ${index + 1}`}
              <input
                type="datetime-local"
                value={option.start}
                onChange={(event) =>
                  updateOption(index, { start: event.target.value })
                }
                className="min-h-11 rounded border border-line-strong bg-surface px-2 text-base text-ink-body"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-subtle">
              {`Slut ${index + 1} (valgfri)`}
              <input
                type="datetime-local"
                value={option.end}
                onChange={(event) =>
                  updateOption(index, { end: event.target.value })
                }
                className="min-h-11 rounded border border-line-strong bg-surface px-2 text-base text-ink-body"
              />
            </label>
            {options.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  setOptions((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Fjern dato ${index + 1}`}
                className="min-h-11 self-end rounded px-3 text-ink-muted hover:bg-surface-sunken"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {options.length < MAX_DATE_OPTIONS && (
          <button
            type="button"
            onClick={() => setOptions((current) => [...current, emptyOption()])}
            className="min-h-11 self-start rounded border border-accent-soft px-3 text-sm text-ink-muted hover:bg-surface"
          >
            Tilføj dato
          </button>
        )}
      </fieldset>

      {shownError && (
        <p role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded border border-line-strong px-4 text-ink-muted"
        >
          Annuller
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded bg-accent px-4 font-medium text-white disabled:opacity-60"
        >
          {submitting ? 'Opretter…' : 'Opret afstemning'}
        </button>
      </div>
    </form>
  )
}

function DatePollCard({
  poll,
  adminId,
  adminIds,
  nameFor,
  busy,
  onVote,
  onChoose,
  onCreateEvent,
  onDelete,
}: {
  poll: DatePoll
  adminId: string
  adminIds: string[]
  nameFor: (id: string | null) => string
  busy: boolean
  onVote: (optionId: string, answer: DatePollAnswer | null) => void
  onChoose: (optionId: string, label: string) => void
  onCreateEvent: () => void
  onDelete: () => void
}) {
  const closed = poll.closed_at !== null
  const best = new Set(bestOptionIds(poll))
  const missing = missingResponders(poll, adminIds)
  const headingId = `date-poll-${poll.id}`

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="font-semibold text-ink-body">
            {poll.title}
            {closed && (
              <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                Afsluttet
              </span>
            )}
          </h3>
          <p className="text-xs text-ink-subtle">
            Oprettet af {nameFor(poll.created_by)}
          </p>
          {poll.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
              {poll.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="min-h-11 rounded px-3 text-sm text-danger hover:bg-danger-surface disabled:opacity-60"
        >
          Slet
        </button>
      </div>

      <ul aria-label="Datoer" className="flex flex-col gap-2">
        {sortedOptions(poll).map((option) => {
          const label = formatOptionDate(option)
          const counts = countAnswers(option)
          const mine = answerFor(option, adminId)
          const isBest = !closed && best.has(option.id)
          const isChosen = poll.chosen_option_id === option.id

          return (
            <li
              key={option.id}
              className={`flex flex-col gap-2 rounded border p-2 ${
                isChosen
                  ? 'border-accent bg-accent-soft/40'
                  : isBest
                    ? 'border-accent-soft bg-surface-raised'
                    : 'border-line-soft'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink-body">
                  {label.charAt(0).toUpperCase() + label.slice(1)}
                </span>
                <span className="text-sm text-ink-subtle">
                  {`${counts.yes} kan · ${counts.maybe} måske · ${counts.no} kan ikke`}
                  {isBest && (
                    <span className="ml-2 font-medium text-ink-body">
                      Passer flest
                    </span>
                  )}
                  {isChosen && (
                    <span className="ml-2 font-medium text-ink-body">
                      Valgt
                    </span>
                  )}
                </span>
              </div>

              {option.votes.length > 0 && (
                <p className="text-xs text-ink-subtle">
                  {answers
                    .map((answer) => {
                      const names = option.votes
                        .filter((vote) => vote.answer === answer)
                        .map((vote) => nameFor(vote.user_id))
                      return names.length
                        ? `${answerLabels[answer]}: ${names.join(', ')}`
                        : null
                    })
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}

              {!closed && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    role="group"
                    aria-label={`Dit svar for ${label}`}
                    className="flex flex-wrap gap-1"
                  >
                    {answers.map((answer) => (
                      <button
                        key={answer}
                        type="button"
                        aria-pressed={mine === answer}
                        disabled={busy}
                        onClick={() =>
                          onVote(option.id, mine === answer ? null : answer)
                        }
                        className={`min-h-11 rounded border px-3 text-sm disabled:opacity-60 ${
                          mine === answer
                            ? answerStyles[answer]
                            : 'border-line-strong text-ink-muted hover:bg-surface-sunken'
                        }`}
                      >
                        {answerLabels[answer]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onChoose(option.id, label)}
                    className="min-h-11 rounded px-3 text-sm text-ink-muted underline disabled:opacity-60"
                  >
                    Vælg denne dato
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!closed && (
        <p className="text-sm text-ink-subtle">
          {missing.length === 0
            ? 'Alle admins har svaret.'
            : `Mangler at svare: ${missing.map(nameFor).join(', ')}`}
        </p>
      )}

      {closed &&
        (poll.event_id ? (
          <Link
            to={`/kalender/${poll.event_id}`}
            className="min-h-11 self-start rounded border border-accent-soft px-4 py-2 text-ink-muted hover:bg-surface-sunken"
          >
            Se begivenheden i kalenderen
          </Link>
        ) : (
          <button
            type="button"
            onClick={onCreateEvent}
            disabled={busy}
            className="min-h-11 self-start rounded bg-accent px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            Opret begivenhed i kalenderen
          </button>
        ))}
    </article>
  )
}

/**
 * "Find en dato" på admin-siden (#288): datoafstemninger, hvor admins svarer
 * kan / kan måske / kan ikke pr. dato, vælger en dato og opretter
 * begivenheden i kalenderen ud fra den.
 */
export function DatePollsSection({ adminId }: { adminId: string }) {
  const { pollsQuery, createPoll, setVote, closePoll, linkEvent, deletePoll } =
    useDatePolls()
  const membersQuery = useMembers()
  const { createEvent } = useEvents(adminId)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [eventPoll, setEventPoll] = useState<DatePoll | null>(null)
  const [eventError, setEventError] = useState<string | null>(null)

  const members = membersQuery.data ?? []
  const adminIds = members.filter((m) => m.is_admin).map((m) => m.id)
  function nameFor(id: string | null) {
    if (id === adminId) return 'dig'
    return (
      members.find((member) => member.id === id)?.full_name?.trim() ||
      'En admin'
    )
  }

  const busy =
    setVote.isPending ||
    closePoll.isPending ||
    deletePoll.isPending ||
    linkEvent.isPending
  const polls = sortPolls(pollsQuery.data ?? [])
  const open = polls.filter((poll) => poll.closed_at === null)
  const closed = polls.filter((poll) => poll.closed_at !== null)

  function run(promise: Promise<unknown>) {
    setActionError(null)
    promise.catch((error: unknown) =>
      setActionError(toFriendlyDatePollError(error)),
    )
  }

  function renderCard(poll: DatePoll) {
    return (
      <DatePollCard
        key={poll.id}
        poll={poll}
        adminId={adminId}
        adminIds={adminIds}
        nameFor={nameFor}
        busy={busy}
        onVote={(optionId, answer) =>
          run(setVote.mutateAsync({ optionId, answer }))
        }
        onChoose={(optionId, label) => {
          if (
            window.confirm(
              `Vælg ${label} til "${poll.title}" og luk afstemningen?`,
            )
          ) {
            run(closePoll.mutateAsync({ pollId: poll.id, optionId }))
          }
        }}
        onCreateEvent={() => {
          setEventError(null)
          setEventPoll(poll)
        }}
        onDelete={() => {
          if (window.confirm(`Vil du slette afstemningen "${poll.title}"?`)) {
            run(deletePoll.mutateAsync(poll.id))
          }
        }}
      />
    )
  }

  const chosen = eventPoll?.options.find(
    (option) => option.id === eventPoll.chosen_option_id,
  )

  function saveEvent(input: EventInput) {
    if (!eventPoll) return
    setEventError(null)
    createEvent
      .mutateAsync(input)
      .then((eventId) =>
        linkEvent.mutateAsync({ pollId: eventPoll.id, eventId }),
      )
      .then(() => setEventPoll(null))
      .catch(() =>
        setEventError(
          'Begivenheden kunne ikke oprettes. Prøv igen om et øjeblik.',
        ),
      )
  }

  return (
    <AdminSection
      title="Find en dato"
      description="Foreslå et par datoer til den næste tur eller det næste møde. De andre admins svarer, hvornår de kan, og når I har overblik, vælger I en dato og opretter begivenheden i kalenderen."
    >
      {creating ? (
        <NewDatePollForm
          submitting={createPoll.isPending}
          error={createError}
          onCancel={() => setCreating(false)}
          onSubmit={(input) => {
            setCreateError(null)
            createPoll
              .mutateAsync(input)
              .then(() => setCreating(false))
              .catch((error: unknown) =>
                setCreateError(toFriendlyDatePollError(error)),
              )
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreateError(null)
            setCreating(true)
          }}
          className="min-h-11 self-start rounded bg-accent px-4 font-medium text-white"
        >
          Ny datoafstemning
        </button>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {pollsQuery.isPending && (
        <p role="status" className="text-sm text-ink-subtle">
          Henter datoafstemninger…
        </p>
      )}
      {pollsQuery.isError && (
        <p role="alert" className="text-sm text-danger">
          Datoafstemningerne kunne ikke hentes.
        </p>
      )}
      {pollsQuery.isSuccess && polls.length === 0 && !creating && (
        <p className="text-sm text-ink-subtle">
          Der er ingen datoafstemninger endnu.
        </p>
      )}

      {open.map(renderCard)}

      {closed.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-ink-body">
            Afsluttede
          </h3>
          {closed.map(renderCard)}
        </>
      )}

      {eventPoll && chosen && (
        <EventForm
          initialValues={{
            title: eventPoll.title,
            description: eventPoll.description,
            start_at: chosen.starts_at,
            end_at: chosen.ends_at,
          }}
          submitting={createEvent.isPending || linkEvent.isPending}
          error={eventError}
          onSubmit={saveEvent}
          onCancel={() => setEventPoll(null)}
        />
      )}
    </AdminSection>
  )
}
