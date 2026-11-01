import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { DatePoll, DatePollAnswer } from './datePolls'

export const datePollsQueryKey = ['date-polls'] as const

// date_polls har to forbindelser til date_poll_options (mulighederne via
// poll_id og den valgte via chosen_option_id), så indlejringen skal navngive
// den, der menes.
const datePollFields = `
  id, title, description, created_by, created_at, closed_at,
  chosen_option_id, event_id,
  options:date_poll_options!date_poll_options_poll_id_fkey(
    id, position, starts_at, ends_at,
    votes:date_poll_votes(user_id, answer)
  )
`

async function fetchDatePolls(): Promise<DatePoll[]> {
  const { data, error } = await supabase
    .from('date_polls')
    .select(datePollFields)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as DatePoll[]
}

const friendlyErrors: Record<string, string> = {
  date_poll_not_authorized: 'Kun administratorer kan bruge datoafstemninger.',
  date_poll_invalid_title: 'Giv afstemningen et navn.',
  date_poll_invalid_options: 'Angiv mellem 2 og 10 gyldige datoer.',
  date_poll_duplicate_option: 'Den samme dato står der to gange.',
  date_poll_closed: 'Afstemningen er lukket.',
  date_poll_not_found: 'Afstemningen findes ikke længere.',
  date_poll_option_not_found: 'Datoen findes ikke længere.',
  date_poll_option_not_in_poll: 'Datoen hører ikke til afstemningen.',
}

/** Databasens fejlkode som en besked til admin'en. */
export function toFriendlyDatePollError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  return friendlyErrors[message] ?? 'Det lykkedes ikke. Prøv igen om lidt.'
}

export function useDatePolls() {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: datePollsQueryKey })

  const pollsQuery = useQuery({
    queryKey: datePollsQueryKey,
    queryFn: fetchDatePolls,
  })

  const createPoll = useMutation({
    mutationFn: async (input: {
      title: string
      description: string | null
      options: { starts_at: string; ends_at: string | null }[]
    }) => {
      const { data, error } = await supabase.rpc('create_date_poll', {
        p_title: input.title,
        p_description: input.description,
        p_options: input.options,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: invalidate,
  })

  const setVote = useMutation({
    mutationFn: async (input: {
      optionId: string
      answer: DatePollAnswer | null
    }) => {
      const { error } = await supabase.rpc('set_date_poll_vote', {
        p_option_id: input.optionId,
        p_answer: input.answer,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const closePoll = useMutation({
    mutationFn: async (input: { pollId: string; optionId: string }) => {
      const { error } = await supabase.rpc('close_date_poll', {
        p_poll_id: input.pollId,
        p_option_id: input.optionId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const linkEvent = useMutation({
    mutationFn: async (input: { pollId: string; eventId: string }) => {
      const { error } = await supabase.rpc('set_date_poll_event', {
        p_poll_id: input.pollId,
        p_event_id: input.eventId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deletePoll = useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await supabase.rpc('delete_date_poll', {
        p_poll_id: pollId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { pollsQuery, createPoll, setVote, closePoll, linkEvent, deletePoll }
}
