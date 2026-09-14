import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import {
  closePollLocally,
  setPollVote,
  upsertPoll,
  type Poll,
  type PollOption,
  type PollVote,
} from './polls'
import type { Message } from './useMessages'

const POLLS_QUERY_KEY_PREFIX = 'message-polls'

/**
 * Nøglen bærer kun *starten* på det indlæste vindue, samme begrundelse som
 * reactionsQueryKey i useReactions.ts: en helt ny besked kan pr. definition
 * ikke have en afstemning, før den findes, og den kommer med via Realtime.
 */
export function pollsQueryKey(windowStartId: string | null) {
  return [POLLS_QUERY_KEY_PREFIX, windowStartId] as const
}

interface PollRow {
  id: string
  message_id: string
  question: string
  created_by: string | null
  closed_at: string | null
  closed_by: string | null
  poll_options: PollOption[] | null
  poll_votes: PollVote[] | null
}

function normalizePollRow(row: PollRow): Poll {
  return {
    id: row.id,
    message_id: row.message_id,
    question: row.question,
    created_by: row.created_by,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    options: row.poll_options ?? [],
    votes: row.poll_votes ?? [],
  }
}

// create_poll (se migrationen 20260913180000_chat_polls.sql) bygger selv sit
// jsonb-svar og navngiver felterne 'options'/'votes' -- ikke
// poll_options/poll_votes, som kun er navnet på PostgREST's indlejrede
// relationer i fetchPolls' select() ovenfor. To forskellige svarformer, to
// mapninger; normalizePollRow ovenfor passer ikke på dette svar.
interface CreatedPollRow {
  id: string
  message_id: string
  question: string
  created_by: string | null
  closed_at: string | null
  closed_by: string | null
  options: PollOption[]
  votes: PollVote[]
}

function normalizeCreatedPoll(row: CreatedPollRow): Poll {
  return {
    id: row.id,
    message_id: row.message_id,
    question: row.question,
    created_by: row.created_by,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    options: row.options,
    votes: row.votes,
  }
}

async function fetchPolls(messageIds: string[]): Promise<Poll[]> {
  if (messageIds.length === 0) return []
  const { data, error } = await supabase
    .from('polls')
    .select(
      `
        id,
        message_id,
        question,
        created_by,
        closed_at,
        closed_by,
        poll_options (id, poll_id, position, label),
        poll_votes (poll_id, user_id, option_id)
      `,
    )
    .in('message_id', messageIds)
  if (error) throw error
  return (data as PollRow[]).map(normalizePollRow)
}

export function usePolls(messages: Message[], currentUserId: string) {
  const queryClient = useQueryClient()
  const windowStartId = messages[0]?.id ?? null

  // Samme begrundelse som i useReactions.ts: nøglen dækker kun vinduets
  // start, så selve id-listen læses gennem en ref på hentetidspunktet.
  const messageIdsRef = useRef<string[]>([])
  messageIdsRef.current = messages.map((message) => message.id)

  const pollsQuery = useQuery({
    queryKey: pollsQueryKey(windowStartId),
    queryFn: () => fetchPolls(messageIdsRef.current),
    enabled: windowStartId !== null,
    staleTime: 60_000,
  })

  function updateCache(update: (current: Poll[] | undefined) => Poll[]) {
    queryClient.setQueriesData<Poll[]>(
      { queryKey: [POLLS_QUERY_KEY_PREFIX] },
      (current) => update(current),
    )
  }

  // En ny afstemning har intet stemmelokalt-vindue at rette i endnu (den
  // findes ikke, før den findes), og lukning/stemmeoptælling er billigt at
  // hente forfra frem for at samle events fra tre tabeller til én
  // sammenhængende afstemning. Så i modsætning til useReactions.ts, som
  // opdaterer cachen direkte fra hvert Realtime-event, genhenter denne bare
  // det aktive vindue -- stadig uden en manuel genindlæsning af siden.
  useEffect(() => {
    const invalidate = () =>
      void queryClient.invalidateQueries({
        queryKey: [POLLS_QUERY_KEY_PREFIX],
      })

    const channel = supabase
      .channel('polls-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'polls' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'polls' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'poll_options' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'poll_votes' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'poll_votes' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'poll_votes' },
        invalidate,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // invalidate lukker kun om queryClient, som er stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  const createPoll = useMutation({
    mutationFn: async ({
      messageId,
      options,
    }: {
      messageId: string
      options: string[]
    }) => {
      const { data, error } = await supabase.rpc('create_poll', {
        p_message_id: messageId,
        p_options: options,
      })
      if (error) throw error
      return normalizeCreatedPoll(data as CreatedPollRow)
    },
    // Opretteren skal se sin egen afstemning med det samme, ikke først når
    // Realtime-invalideringen (se ovenfor) har hentet vinduet forfra.
    onSuccess: (poll) => {
      updateCache((current) => upsertPoll(current, poll))
    },
  })

  const castVote = useMutation({
    mutationFn: async ({
      pollId,
      optionId,
    }: {
      pollId: string
      optionId: string
    }) => {
      const { error } = await supabase.rpc('cast_poll_vote', {
        p_poll_id: pollId,
        p_option_id: optionId,
      })
      if (error) throw error
    },
    // Optimistisk med det samme, som toggleReaction i useReactions.ts --
    // Realtime-ekkoet af ens egen stemme er idempotent via setPollVote.
    onMutate: ({ pollId, optionId }) => {
      const vote: PollVote = {
        poll_id: pollId,
        user_id: currentUserId,
        option_id: optionId,
      }
      const previousVote = pollsQuery.data
        ?.find((poll) => poll.id === pollId)
        ?.votes.find((existing) => existing.user_id === currentUserId)
      updateCache((current) => setPollVote(current, vote))
      return { pollId, previousVote }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      updateCache((current) => {
        if (!current) return []
        if (context.previousVote) {
          return setPollVote(current, context.previousVote)
        }
        // Der var ingen tidligere stemme at falde tilbage til -- fjern den
        // mislykkede optimistiske stemme igen.
        return current.map((poll) =>
          poll.id === context.pollId
            ? {
                ...poll,
                votes: poll.votes.filter(
                  (vote) => vote.user_id !== currentUserId,
                ),
              }
            : poll,
        )
      })
    },
  })

  const closePoll = useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await supabase.rpc('close_poll', { p_poll_id: pollId })
      if (error) throw error
    },
    onSuccess: (_data, pollId) => {
      updateCache((current) =>
        closePollLocally(
          current,
          pollId,
          currentUserId,
          new Date().toISOString(),
        ),
      )
    },
  })

  return { polls: pollsQuery.data, createPoll, castVote, closePoll }
}
