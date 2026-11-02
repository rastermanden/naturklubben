import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { DatePoll, DatePollAnswer } from './datePolls'

const friendly: Record<string, string> = {
  DATE_POLL_NOT_AUTHORIZED: 'Kun administratorer kan bruge datoafstemninger.',
  DATE_POLL_INVALID_TITLE: 'Giv afstemningen et navn.',
  DATE_POLL_INVALID_OPTIONS: 'Angiv mellem 2 og 10 gyldige datoer.',
  DATE_POLL_DUPLICATE_OPTION: 'Den samme dato står der to gange.',
  DATE_POLL_CLOSED: 'Afstemningen er lukket.',
  DATE_POLL_NOT_FOUND: 'Afstemningen findes ikke længere.',
  DATE_POLL_OPTION_NOT_FOUND: 'Datoen findes ikke længere.',
  DATE_POLL_OPTION_NOT_IN_POLL: 'Datoen hører ikke til afstemningen.',
  DATE_POLL_NOT_CLOSED: 'Afstemningen er ikke lukket endnu.',
  DATE_POLL_EVENT_NOT_FOUND: 'Begivenheden findes ikke.',
}

export function toFriendlyDatePollError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  for (const [code, text] of Object.entries(friendly)) {
    if (message.includes(code)) return text
  }
  return 'Det lykkedes ikke. Prøv igen om lidt.'
}

export function useDatePolls() {
  const polls = useQuery(api.datePolls.list) as DatePoll[] | undefined
  const create = useMutation(api.datePolls.create)
  const vote = useMutation(api.datePolls.vote)
  const close = useMutation(api.datePolls.close)
  const link = useMutation(api.datePolls.linkEvent)
  const remove = useMutation(api.datePolls.remove)

  return {
    polls,
    createPoll: (input: {
      title: string
      description: string | null
      options: { starts_at: string; ends_at: string | null }[]
    }) =>
      create({
        title: input.title,
        description: input.description,
        options: input.options.map((option) => ({
          startsAt: new Date(option.starts_at).getTime(),
          endsAt: option.ends_at ? new Date(option.ends_at).getTime() : null,
        })),
      }),
    setVote: (optionId: string, answer: DatePollAnswer | null) =>
      vote({
        optionId: optionId as Id<'datePollOptions'>,
        answer,
      }),
    closePoll: (pollId: string, optionId: string) =>
      close({
        pollId: pollId as Id<'datePolls'>,
        optionId: optionId as Id<'datePollOptions'>,
      }),
    linkEvent: (pollId: string, eventId: string) =>
      link({
        pollId: pollId as Id<'datePolls'>,
        eventId: eventId as Id<'events'>,
      }),
    deletePoll: (pollId: string) =>
      remove({ pollId: pollId as Id<'datePolls'> }),
  }
}
