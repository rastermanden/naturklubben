import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import {
  isAfterPosition,
  upsertPosition,
  type ReadPosition,
} from './readReceipts'
import type { ChatRoom, Message } from './useMessages'

const positionFields = 'user_id, room, last_read_message_id, last_read_at'

export function readPositionsQueryKey(room: ChatRoom) {
  return ['chat-read-positions', room] as const
}

/**
 * Læsekvitteringer i et chatrum (#294): alle medlemmers læsepositioner, live
 * via Realtime -- og ens egen position flyttes til den nyeste besked, når
 * den er på skærmen og appen er i forgrunden.
 */
export function useReadReceipts(
  room: ChatRoom,
  messages: readonly Message[],
  currentUserId: string,
  /** Står den nyeste besked på skærmen (bunden af listen er synlig)? */
  latestIsVisible: boolean,
) {
  const queryClient = useQueryClient()
  const queryKey = readPositionsQueryKey(room)

  const positionsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<ReadPosition[]> => {
      const { data, error } = await supabase
        .from('chat_read_positions')
        .select(positionFields)
        .eq('room', room)
      if (error) throw error
      return data as ReadPosition[]
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    const key = readPositionsQueryKey(room)
    function apply(position: ReadPosition) {
      queryClient.setQueryData<ReadPosition[]>(key, (current) =>
        upsertPosition(current, position),
      )
    }
    const channel = supabase
      .channel(`chat-read-positions-${room}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_read_positions',
          filter: `room=eq.${room}`,
        },
        (payload) => apply(payload.new as ReadPosition),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_read_positions',
          filter: `room=eq.${room}`,
        },
        (payload) => apply(payload.new as ReadPosition),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [room, queryClient])

  const latest = messages[messages.length - 1]
  const ownPosition = positionsQuery.data?.find(
    (position) => position.user_id === currentUserId,
  )
  // Den sidst sendte markering, så samme besked ikke sendes igen, mens
  // svaret er på vej.
  const lastMarkedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!latest || !latestIsVisible || !positionsQuery.isSuccess) return

    function markIfVisible() {
      if (!latest || document.visibilityState !== 'visible') return
      if (lastMarkedRef.current === latest.id) return
      if (!isAfterPosition(latest, ownPosition)) return
      lastMarkedRef.current = latest.id
      void supabase
        .rpc('mark_chat_read', { p_message_id: latest.id })
        .then(({ error }) => {
          // En fejl her er ikke værd at forstyrre med -- den næste besked
          // eller næste gang appen kommer i forgrunden prøver igen.
          if (error) lastMarkedRef.current = null
        })
    }

    markIfVisible()
    document.addEventListener('visibilitychange', markIfVisible)
    return () => document.removeEventListener('visibilitychange', markIfVisible)
    // ownPosition læses med vilje ikke som afhængighed: den skifter, når
    // vores egen markering kommer tilbage via Realtime, og det skal ikke
    // starte en ny runde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latestIsVisible, positionsQuery.isSuccess])

  return { positions: positionsQuery.data ?? [] }
}
