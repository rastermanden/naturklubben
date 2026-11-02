import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { AdminSection } from '../members/AdminSection'
import { EventForm } from '../calendar/EventForm'
import { useMembers } from '../members/useMembers'
import {
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Navn
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded border border-line-strong px-3 py-2"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Beskrivelse (valgfri)
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded border border-line-strong px-3 py-2"
          rows={2}
        />
      </label>
      {options.map((option, index) => (
        <div key={index} className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Start
            <input
              type="datetime-local"
              value={option.start}
              onChange={(event) =>
                setOptions((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, start: event.target.value } : item,
                  ),
                )
              }
              className="rounded border border-line-strong px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Slut (valgfri)
            <input
              type="datetime-local"
              value={option.end}
              onChange={(event) =>
                setOptions((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, end: event.target.value } : item,
                  ),
                )
              }
              className="rounded border border-line-strong px-3 py-2"
            />
          </label>
        </div>
      ))}
      {options.length < 10 && (
        <button
          type="button"
          onClick={() => setOptions((current) => [...current, emptyOption()])}
          className="min-h-11 self-start text-sm underline"
        >
          Tilføj en dato
        </button>
      )}
      {(validationError || error) && (
        <p role="alert" className="text-sm text-danger">
          {validationError ?? error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded bg-accent px-4 text-white disabled:opacity-60"
        >
          {submitting ? 'Opretter…' : 'Opret afstemning'}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 px-3">
          Annullér
        </button>
      </div>
    </form>
  )
}

export function DatePollsSection({ adminId }: { adminId: string }) {
  const actions = useDatePolls()
  const { members } = useMembers()
  const createEvent = useMutation(api.calendar.createEvent)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [eventPoll, setEventPoll] = useState<DatePoll | null>(null)

  const adminIds = members
    .filter((member) => member.isAdmin)
    .map((member) => member._id)
  const polls = sortPolls(actions.polls ?? [])
  const open = polls.filter((poll) => poll.closed_at === null)
  const closed = polls.filter((poll) => poll.closed_at !== null)

  function nameFor(id: string | null) {
    if (id === adminId) return 'dig'
    return (
      members.find((member) => member._id === id)?.fullName?.trim() ||
      'En admin'
    )
  }

  async function run(task: Promise<unknown>) {
    setActionError(null)
    setBusy(true)
    try {
      await task
    } catch (error) {
      setActionError(toFriendlyDatePollError(error))
    } finally {
      setBusy(false)
    }
  }

  const chosen = eventPoll?.options.find(
    (option) => option.id === eventPoll.chosen_option_id,
  )

  return (
    <AdminSection
      title="Find en dato"
      description="Foreslå et par datoer til den næste tur eller det næste møde. De andre admins svarer, hvornår de kan, og når I har overblik, vælger I en dato og opretter begivenheden i kalenderen."
    >
      {creating ? (
        <NewDatePollForm
          submitting={busy}
          error={createError}
          onCancel={() => setCreating(false)}
          onSubmit={(input) => {
            setCreateError(null)
            setBusy(true)
            void actions
              .createPoll(input)
              .then(() => setCreating(false))
              .catch((error: unknown) =>
                setCreateError(toFriendlyDatePollError(error)),
              )
              .finally(() => setBusy(false))
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
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
      {actions.polls === undefined && (
        <p role="status" className="text-sm text-ink-subtle">
          Henter datoafstemninger…
        </p>
      )}
      {actions.polls !== undefined && polls.length === 0 && !creating && (
        <p className="text-sm text-ink-subtle">
          Der er ingen datoafstemninger endnu.
        </p>
      )}
      {open.map((poll) => (
        <PollCard
          key={poll.id}
          poll={poll}
          adminId={adminId}
          adminIds={adminIds}
          nameFor={nameFor}
          busy={busy}
          onVote={(optionId, answer) =>
            void run(actions.setVote(optionId, answer))
          }
          onChoose={(optionId, label) => {
            if (
              window.confirm(
                `Vælg ${label} til "${poll.title}" og luk afstemningen?`,
              )
            ) {
              void run(actions.closePoll(poll.id, optionId))
            }
          }}
          onCreateEvent={() => setEventPoll(poll)}
          onDelete={() => {
            if (window.confirm(`Vil du slette afstemningen "${poll.title}"?`)) {
              void run(actions.deletePoll(poll.id))
            }
          }}
        />
      ))}
      {closed.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-ink-body">
            Afsluttede
          </h3>
          {closed.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              adminId={adminId}
              adminIds={adminIds}
              nameFor={nameFor}
              busy={busy}
              onVote={() => undefined}
              onChoose={() => undefined}
              onCreateEvent={() => setEventPoll(poll)}
              onDelete={() => {
                if (
                  window.confirm(`Vil du slette afstemningen "${poll.title}"?`)
                ) {
                  void run(actions.deletePoll(poll.id))
                }
              }}
            />
          ))}
        </>
      )}
      {eventPoll && chosen && (
        <EventForm
          seed={{
            title: eventPoll.title,
            description: eventPoll.description,
            startAt: new Date(chosen.starts_at).getTime(),
            endAt: chosen.ends_at ? new Date(chosen.ends_at).getTime() : null,
          }}
          submitting={busy}
          error={null}
          onCancel={() => setEventPoll(null)}
          onSubmit={(input) => {
            void run(
              createEvent(input).then((result) =>
                actions.linkEvent(eventPoll.id, result.eventId),
              ),
            ).then(() => setEventPoll(null))
          }}
        />
      )}
    </AdminSection>
  )
}

function PollCard({
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
  const best = new Set(bestOptionIds(poll))
  const missing = missingResponders(poll, adminIds)
  const closed = poll.closed_at !== null
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-ink">{poll.title}</h3>
          {poll.description && (
            <p className="text-sm text-ink-subtle">{poll.description}</p>
          )}
          <p className="text-xs text-ink-subtle">
            Oprettet af {nameFor(poll.created_by)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-danger"
        >
          Slet
        </button>
      </div>
      {sortedOptions(poll).map((option) => {
        const counts = countAnswers(option)
        const mine = answerFor(option, adminId)
        const label = formatOptionDate(option)
        return (
          <div key={option.id} className="flex flex-col gap-2">
            <p className="text-sm text-ink">
              {label}
              {best.has(option.id) ? ' · passer flest' : ''}
              {poll.chosen_option_id === option.id ? ' · valgt' : ''}
            </p>
            <p className="text-xs text-ink-subtle">
              {counts.yes} kan · {counts.maybe} kan måske · {counts.no} kan ikke
            </p>
            {!closed && (
              <div className="flex flex-wrap gap-2">
                {answers.map((answer) => (
                  <button
                    key={answer}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onVote(option.id, mine === answer ? null : answer)
                    }
                    className="min-h-11 rounded border border-line-strong px-3 text-sm"
                  >
                    {answerLabels[answer]}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onChoose(option.id, label)}
                  className="min-h-11 rounded bg-accent px-3 text-sm text-white"
                >
                  Vælg denne dato
                </button>
              </div>
            )}
          </div>
        )
      })}
      {missing.length > 0 && !closed && (
        <p className="text-xs text-ink-subtle">
          Mangler svar fra {missing.map((id) => nameFor(id)).join(', ')}
        </p>
      )}
      {closed && poll.event_id === null && (
        <button
          type="button"
          onClick={onCreateEvent}
          className="min-h-11 self-start rounded border border-accent-soft px-3 text-sm"
        >
          Opret begivenhed
        </button>
      )}
    </article>
  )
}
