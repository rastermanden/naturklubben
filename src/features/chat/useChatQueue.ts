// Offline-køen i appen (#219): hvad der venter, og hvornår det sendes.
//
// Køen tømmes tre steder fra: ved app-start, når `online`-hændelsen kommer, og
// når service workeren (gennem Background Sync) beder fanen om at gøre det.
// Selve afsendelsen er injiceret (`send`), så hooken hverken kender Supabase
// eller besked-cachen -- den kender kun køen og lageret.
import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_QUEUE_FLUSH_MESSAGE } from '../../lib/chatQueueSync'
import { requestChatQueueSync } from './backgroundSync'
import {
  createQueuedMessage,
  enqueueMessage,
  errorText,
  isQueued,
  markMessageFailed,
  markMessageSending,
  mergeQueues,
  nextSendableMessage,
  queueForRoom,
  removeQueuedMessage,
  resumeInterruptedQueue,
  resumeQueuedMessage,
} from './offlineQueue'
import type { QueuedDraft, QueuedMessage } from './offlineQueue'
import { createQueueStore } from './offlineQueueStore'
import type { QueueStore } from './offlineQueueStore'
import type { ChatRoom, Message } from './useMessages'

export interface ChatQueue {
  /** Beskeder i dette rum, der endnu ikke er bekræftet af serveren. */
  messages: QueuedMessage[]
  isOffline: boolean
  enqueue: (draft: QueuedDraft) => Promise<QueuedMessage>
  retry: (clientId: string) => void
  discard: (clientId: string) => void
  isQueued: (clientId: string) => boolean
}

function isOnline(): boolean {
  // En browser uden `navigator` (eller uden `onLine`) må ikke få appen til at
  // tro, at den er offline -- så ville intet nogensinde blive sendt direkte.
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Et id, der er unikt nok til at være beskedens primærnøgle. */
export function newClientId(): string {
  const generator = globalThis.crypto
  if (generator && typeof generator.randomUUID === 'function') {
    return generator.randomUUID()
  }
  // Nødudgang for miljøer uden WebCrypto (ældre Safari, jsdom uden `crypto`).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function useChatQueue({
  room,
  userId,
  send,
  deliver,
}: {
  room: ChatRoom
  userId: string
  send: (message: QueuedMessage) => Promise<{
    message: Message
    inserted: boolean
  }>
  /** Kaldes, når serveren har kvitteret. `notify` er false for en gentagelse. */
  deliver: (message: Message, result: { notify: boolean }) => void
}): ChatQueue {
  const [store] = useState<QueueStore>(createQueueStore)
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const [isOffline, setIsOffline] = useState(() => !isOnline())
  const queueRef = useRef<QueuedMessage[]>([])
  const flushing = useRef(false)
  const sendRef = useRef(send)
  const deliverRef = useRef(deliver)
  const userIdRef = useRef(userId)

  useEffect(() => {
    sendRef.current = send
    deliverRef.current = deliver
    userIdRef.current = userId
  })

  // Køen findes både i state (til visningen) og i en ref (til afsendelsen).
  // Afsendelsen skal kunne læse den nyeste kø med det samme -- et state-opslag
  // er først opdateret efter næste rendering -- og alle ændringer går derfor
  // gennem den samme funktion.
  const commit = useCallback((next: QueuedMessage[]) => {
    queueRef.current = next
    setQueue(next)
  }, [])

  const persist = useCallback(
    async (next: QueuedMessage[], clientId: string) => {
      const entry = next.find((candidate) => candidate.clientId === clientId)
      if (entry) await store.put(entry)
      return next
    },
    [store],
  )

  const flush = useCallback(async () => {
    if (flushing.current || !isOnline()) return
    flushing.current = true
    try {
      for (;;) {
        const entry = nextSendableMessage(queueRef.current, userIdRef.current)
        if (!entry || !isOnline()) break

        commit(
          await persist(
            markMessageSending(queueRef.current, entry.clientId),
            entry.clientId,
          ),
        )

        try {
          const { message, inserted } = await sendRef.current(entry)
          await store.remove(entry.clientId)
          commit(removeQueuedMessage(queueRef.current, entry.clientId))
          deliverRef.current(message, { notify: inserted })
        } catch (error) {
          // Rækkefølgen holdes: en besked, der ikke kunne sendes, stopper køen
          // frem for at lade de næste overhale den.
          const failed = markMessageFailed(
            queueRef.current,
            entry.clientId,
            errorText(error),
          )
          commit(failed)
          await persist(failed, entry.clientId)
          break
        }
      }
    } finally {
      flushing.current = false
    }
  }, [commit, persist, store])

  // App-start: læs køen ind (den ligger i IndexedDB fra sidste gang) og send
  // det, der ligger klar.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const stored = resumeInterruptedQueue(await store.list())
      if (cancelled) return
      commit(mergeQueues(queueRef.current, stored))
      await Promise.all(stored.map((entry) => store.put(entry)))
      await flush()
    })()
    return () => {
      cancelled = true
    }
  }, [commit, flush, store])

  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false)
      void flush()
    }
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [flush])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (
        (event.data as { type?: unknown } | null)?.type ===
        CHAT_QUEUE_FLUSH_MESSAGE
      ) {
        void flush()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [flush])

  const enqueue = useCallback(
    async (draft: QueuedDraft) => {
      const entry = createQueuedMessage(
        draft,
        newClientId(),
        new Date().toISOString(),
      )
      commit(enqueueMessage(queueRef.current, entry))
      await store.put(entry)
      // Background Sync, hvor browseren har det. Uden det bliver beskeden
      // liggende, til appen åbnes igen.
      void requestChatQueueSync()
      // Uden forbindelse sker der intet her; skyldtes kø-lægningen en fejlet
      // forespørgsel med forbindelse, får den et forsøg mere med det samme.
      void flush()
      return entry
    },
    [commit, flush, store],
  )

  const retry = useCallback(
    (clientId: string) => {
      const next = resumeQueuedMessage(queueRef.current, clientId)
      commit(next)
      void (async () => {
        await persist(next, clientId)
        await flush()
      })()
    },
    [commit, flush, persist],
  )

  const discard = useCallback(
    (clientId: string) => {
      commit(removeQueuedMessage(queueRef.current, clientId))
      void store.remove(clientId)
    },
    [commit, store],
  )

  return {
    messages: queueForRoom(queue, room, userId),
    isOffline,
    enqueue,
    retry,
    discard,
    isQueued: (clientId: string) => isQueued(queueRef.current, clientId),
  }
}
