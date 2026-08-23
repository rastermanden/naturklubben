import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { addReaction, removeReaction, type Reaction } from './reactions'
import type { Message } from './useMessages'

const reactionFields = 'message_id, user_id, emoji'

/**
 * Nøglen bærer kun *starten* på det indlæste vindue, ikke hele id-listen.
 * Det er med vilje: en ny besked flytter kun vinduets ende, og en helt ny
 * besked kan pr. definition ikke nå at have reaktioner, før den findes -- dem,
 * der kommer bagefter, leveres af Realtime. Ville nøglen indeholde alle id'er,
 * ville hver eneste indkommende besked udløse en ny hentning af samtlige
 * reaktioner. Når #106 gør det muligt at hente ældre beskeder, flytter
 * vinduets start, nøglen skifter, og reaktionerne hentes for det nye vindue.
 */
export function reactionsQueryKey(windowStartId: string | null) {
  return ['message-reactions', windowStartId] as const
}

async function fetchReactions(messageIds: string[]): Promise<Reaction[]> {
  if (messageIds.length === 0) return []
  const { data, error } = await supabase
    .from('message_reactions')
    .select(reactionFields)
    .in('message_id', messageIds)
  if (error) throw error
  return data as Reaction[]
}

export function useReactions(messages: Message[], currentUserId: string) {
  const queryClient = useQueryClient()
  const windowStartId = messages[0]?.id ?? null

  // Nøglen dækker kun vinduets start (se ovenfor), så selve id-listen læses
  // gennem en ref på hentetidspunktet i stedet for at indgå i nøglen.
  const messageIdsRef = useRef<string[]>([])
  messageIdsRef.current = messages.map((message) => message.id)

  const reactionsQuery = useQuery({
    queryKey: reactionsQueryKey(windowStartId),
    queryFn: () => fetchReactions(messageIdsRef.current),
    enabled: windowStartId !== null,
    staleTime: 60_000,
  })

  // Opdaterer den aktive vinduesnøgle, uanset hvilken det er.
  function updateCache(
    update: (current: Reaction[] | undefined) => Reaction[],
  ) {
    queryClient.setQueriesData<Reaction[]>(
      { queryKey: ['message-reactions'] },
      (current) => update(current),
    )
  }

  useEffect(() => {
    const channel = supabase
      .channel('message-reactions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const reaction = payload.new as Reaction
          updateCache((current) => addReaction(current, reaction))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          // Primærnøglen er (message_id, user_id, emoji), og den er tabellens
          // replica identity — `old` bærer derfor alle tre kolonner.
          const reaction = payload.old as Reaction
          updateCache((current) => removeReaction(current, reaction))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // updateCache lukker kun om queryClient, som er stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  const toggleReaction = useMutation({
    mutationFn: async ({
      messageId,
      emoji,
      reactedByMe,
    }: {
      messageId: string
      emoji: string
      reactedByMe: boolean
    }) => {
      const row = {
        message_id: messageId,
        user_id: currentUserId,
        emoji,
      }
      const { error } = reactedByMe
        ? await supabase.from('message_reactions').delete().match(row)
        : await supabase.from('message_reactions').insert(row)
      if (error) throw error
    },
    // Reaktioner skal føles øjeblikkelige på mobil, så cachen opdateres med
    // det samme. Realtime leverer bagefter den samme ændring; addReaction og
    // removeReaction er idempotente, så ekkoet ændrer ingenting.
    onMutate: ({ messageId, emoji, reactedByMe }) => {
      const row = { message_id: messageId, user_id: currentUserId, emoji }
      updateCache((current) =>
        reactedByMe ? removeReaction(current, row) : addReaction(current, row),
      )
      return { row, reactedByMe }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      updateCache((current) =>
        context.reactedByMe
          ? addReaction(current, context.row)
          : removeReaction(current, context.row),
      )
    },
  })

  return { reactions: reactionsQuery.data, toggleReaction }
}
