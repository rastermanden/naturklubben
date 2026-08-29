import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'

export interface AwayState {
  /** Valgfri begrundelse, som de andre online kan se. */
  message: string | null
}

export interface PresenceMember {
  userId: string
  isAway: boolean
  awayMessage: string | null
}

interface PresencePayload {
  userId: string
  isAway?: boolean
  awayMessage?: string | null
}

/**
 * Tracker hvilke brugere der er aktive i chatten via Supabase Realtime Presence.
 * Den aktuelle bruger meldes ind, og listen over alle tilstedeværende opdateres live.
 * Væk-status ("/away") rejser med i selve presence-payloaden og er derfor
 * flygtig -- den forsvinder af sig selv, når fanen lukkes, og kræver ingen tabel.
 */
export function useOnlinePresence(
  currentUserId: string,
  away: AwayState | null = null,
): PresenceMember[] {
  const [members, setMembers] = useState<PresenceMember[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const isSubscribed = useRef(false)
  const awayRef = useRef(away)

  // Holder den seneste væk-status tilgængelig for subscribe-callbacket, uden
  // at kanalen skal rives ned og bygges op igen, hver gang den ændrer sig.
  useEffect(() => {
    awayRef.current = away
  }, [away])

  useEffect(() => {
    const channel = supabase.channel('chat-presence', {
      config: { presence: { key: currentUserId } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>()
        const seen = new Map<string, PresenceMember>()
        for (const entry of Object.values(state).flat()) {
          if (!entry.userId || seen.has(entry.userId)) continue
          seen.set(entry.userId, {
            userId: entry.userId,
            isAway: Boolean(entry.isAway),
            awayMessage: entry.awayMessage ?? null,
          })
        }
        setMembers([...seen.values()])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed.current = true
          await channel.track({
            userId: currentUserId,
            isAway: Boolean(awayRef.current),
            awayMessage: awayRef.current?.message ?? null,
          })
        }
      })

    return () => {
      channelRef.current = null
      isSubscribed.current = false
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  // Skifter væk-status, mens kanalen allerede er oppe, sendes den som en ny
  // track() -- ellers ville de andre først se ændringen ved næste reconnect.
  useEffect(() => {
    const channel = channelRef.current
    if (!channel || !isSubscribed.current) return
    void channel.track({
      userId: currentUserId,
      isAway: Boolean(away),
      awayMessage: away?.message ?? null,
    })
  }, [currentUserId, away])

  return members
}
