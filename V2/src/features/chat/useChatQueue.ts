import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
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
import type { ChatRoom } from './types'

/**
 * Offline-køen i appen (#219): hvad der venter, og hvornår det sendes.
 *
 * Køen tømmes ved app-start, når `online`-hændelsen kommer, og når fanen igen
 * bliver synlig. Selve afsendelsen er injiceret (`send`), så hooken hverken
 * kender Convex eller beskedlisten -- den kender kun køen og lageret.
 *
 * Den gamle app kunne også vækkes af service workerens Background Sync. V2 har
 * ingen service worker endnu (PWA-delen er ikke portet), så den vej findes
 * ikke her; til gengæld er der intet at vente på ud over det næste
 * `online`-signal eller næste gang, fanen bliver synlig.
 */
export interface ChatQueue {
  /** Beskeder i dette rum, der endnu ikke er bekræftet af serveren. */
  messages: QueuedMessage[]
  isOffline: boolean
  enqueue: (draft: QueuedDraft, clientId?: string) => Promise<QueuedMessage>
  retry: (clientId: string) => void
  discard: (clientId: string) => void
  isQueued: (clientId: string) => boolean
}

function isOnline(): boolean {
  // En browser uden `navigator` (eller uden `onLine`) må ikke få appen til at
  // tro, at den er offline -- så ville intet nogensinde blive sendt direkte.
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Et id, der er unikt nok til at være beskedens idempotensnøgle. */
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
  profileId,
  send,
  deliver,
}: {
  room: ChatRoom
  profileId: Id<'profiles'>
  send: (
    message: QueuedMessage,
  ) => Promise<{ messageId: Id<'messages'>; inserted: boolean }>
  /** Kaldes, når serveren har kvitteret. `notify` er false for en gentagelse. */
  deliver: (
    messageId: Id<'messages'>,
    result: { notify: boolean },
  ) => void
}): ChatQueue {
  const [store] = useState<QueueStore>(createQueueStore)
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const [isOffline, setIsOffline] = useState(() => !isOnline())
  const queueRef = useRef<QueuedMessage[]>([])
  const flushing = useRef(false)
  const sendRef = useRef(send)
  const deliverRef = useRef(deliver)
  const profileIdRef = useRef(profileId)

  useEffect(() => {
    sendRef.current = send
    deliverRef.current = deliver
    profileIdRef.current = profileId
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
        const entry = nextSendableMessage(
          queueRef.current,
          profileIdRef.current,
          room,
        )
        if (!entry || !isOnline()) break

        commit(
          await persist(
            markMessageSending(queueRef.current, entry.clientId),
            entry.clientId,
          ),
        )

        try {
          const { messageId, inserted } = await sendRef.current(entry)
          await store.remove(entry.clientId)
          commit(removeQueuedMessage(queueRef.current, entry.clientId))
          deliverRef.current(messageId, { notify: inserted })
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
  }, [commit, persist, room, store])

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
    // Uden Background Sync er et skift tilbage til fanen det næstbedste
    // signal: forbindelsen kan være kommet igen, uden at browseren har sendt
    // `online`.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flush])

  const enqueue = useCallback(
    async (draft: QueuedDraft, clientId?: string) => {
      // Kalderen kan give sit eget id med: en afsendelse, der fik et
      // netværkssvar, den ikke kunne tyde, lægges i køen med det id, den
      // allerede forsøgte -- ellers ville et forsøg, der nåede frem, blive
      // til en dublet, når køen sender igen.
      const entry = createQueuedMessage(
        draft,
        clientId ?? newClientId(),
        Date.now(),
      )
      commit(enqueueMessage(queueRef.current, entry))
      await store.put(entry)
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
    messages: queueForRoom(queue, room, profileId),
    isOffline,
    enqueue,
    retry,
    discard,
    isQueued: (clientId: string) => isQueued(queueRef.current, clientId),
  }
}
