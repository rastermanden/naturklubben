import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { isAfterPosition, type ReadPosition } from './readReceipts'
import type { ChatRoom, MessageView } from './types'

/**
 * Læsekvitteringer i et chatrum: alle medlemmers læsepositioner, live via
 * Convex-abonnementet -- og ens egen position flyttes til den nyeste besked,
 * når den er på skærmen og appen er i forgrunden.
 */
export function useReadReceipts(
  room: ChatRoom,
  messages: readonly MessageView[],
  currentUserId: string,
  /** Står den nyeste besked på skærmen (bunden af listen er synlig)? */
  latestIsVisible: boolean,
) {
  const positions = useQuery(api.chat.readPositions, { room })
  const markMessageRead = useMutation(api.chat.markMessageRead)

  const latest = messages[messages.length - 1]
  const own = positions?.find(
    (position) => position.profileId === currentUserId,
  )
  const ownPosition: ReadPosition | undefined = own
    ? {
        userId: own.profileId,
        room: own.room,
        lastReadMessageId: own.lastReadMessageId,
        lastReadAt: own.lastReadAt,
      }
    : undefined
  // Den sidst sendte markering, så samme besked ikke sendes igen, mens
  // svaret er på vej.
  const lastMarkedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!latest || !latestIsVisible || positions === undefined) return

    function markIfVisible() {
      if (!latest || document.visibilityState !== 'visible') return
      if (lastMarkedRef.current === latest.messageId) return
      if (
        !isAfterPosition(
          {
            id: latest.messageId,
            userId: latest.authorId,
            createdAt: latest.createdAt,
          },
          ownPosition,
        )
      ) {
        return
      }
      lastMarkedRef.current = latest.messageId
      void markMessageRead({ messageId: latest.messageId }).catch(() => {
        // En fejl her er ikke værd at forstyrre med -- den næste besked
        // eller næste gang appen kommer i forgrunden prøver igen.
        lastMarkedRef.current = null
      })
    }

    markIfVisible()
    document.addEventListener('visibilitychange', markIfVisible)
    return () => document.removeEventListener('visibilitychange', markIfVisible)
    // ownPosition læses med vilje ikke som afhængighed: den skifter, når
    // vores egen markering kommer tilbage, og det skal ikke starte en ny runde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.messageId, latestIsVisible, positions === undefined])

  return { positions: positions ?? [] }
}
