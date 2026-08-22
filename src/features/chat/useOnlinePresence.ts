import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export interface PresenceState {
  userId: string
}

/**
 * Tracker hvilke brugere der er aktive i chatten via Supabase Realtime Presence.
 * Den aktuelle bruger meldes ind, og listen over alle tilstedeværende opdateres live.
 */
export function useOnlinePresence(currentUserId: string): string[] {
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])

  useEffect(() => {
    const channel = supabase.channel('chat-presence', {
      config: { presence: { key: currentUserId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const ids = Object.values(state)
          .flat()
          .map((p) => p.userId)
          .filter((id): id is string => Boolean(id))
          .filter((id, index, arr) => arr.indexOf(id) === index)
        setOnlineUserIds(ids)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: currentUserId })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  return onlineUserIds
}
