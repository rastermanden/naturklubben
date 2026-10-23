import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { newClientId, useChatQueue } from './useChatQueue'
import { errorText, isRetryableSendError } from './offlineQueue'
import type { QueuedDraft } from './offlineQueue'
import type {
  ChatMember,
  ChatRoom,
  ChatViewer,
  MessageType,
  UnreadSummary,
} from './types'

/**
 * Convex-hooks til chatten.
 *
 * Der er ingen `supabase.channel`, ingen `useQueryClient` og ingen manuel
 * invalidering: `useQuery` og `usePaginatedQuery` *er* abonnementet. Kommer
 * der en besked, en reaktion eller en stemme, mens siden er åben, sender
 * Convex det nye svar selv, og React tegner det. Det er hele grunden til, at
 * denne fil er så meget kortere end den gamle apps `useMessages.ts`, som både
 * hentede, lyttede på tre tabeller og holdt styr på, hvad der var kommet først.
 */

/** Hvor mange beskeder der hentes ad gangen. */
export const MESSAGE_PAGE_SIZE = 30

/** Hvor mange søgetræffere der vises ad gangen, og loftet for "vis flere". */
export const SEARCH_PAGE_SIZE = 20

/** Hvor ofte et åbent chatvindue siger, at det stadig er der. */
export const HEARTBEAT_INTERVAL_MS = 30_000

const SEARCH_DEBOUNCE_MS = 250

type ReactionEmoji = FunctionArgs<typeof api.chat.toggleReaction>['emoji']
type PollId = FunctionArgs<typeof api.chatPolls.castPollVote>['pollId']
type PollOptionId = FunctionArgs<typeof api.chatPolls.castPollVote>['optionId']

/** Hvem læseren er: profil-id, navn og admin-status. */
export function useChatViewer(): ChatViewer | undefined {
  return useQuery(api.chat.viewer)
}

/** Medlemmerne, som mention-vælgeren og navneopslag bruger. */
export function useChatMembers(): ChatMember[] | undefined {
  return useQuery(api.chat.members)
}

/**
 * Beskedhistorikken som et abonnement. `results` leveres nyeste først, så
 * visningen vender den om; `loadOlder` henter en side mere af gangen.
 */
export function useChatHistory(room: ChatRoom) {
  const paginated = usePaginatedQuery(
    api.chat.history,
    { room },
    { initialNumItems: MESSAGE_PAGE_SIZE },
  )

  const messages = useMemo(
    () => [...paginated.results].reverse(),
    [paginated.results],
  )

  return {
    /** Ældste først, som en chat læses. */
    messages,
    isFirstLoad: paginated.status === 'LoadingFirstPage',
    hasMore: paginated.status === 'CanLoadMore',
    isLoadingMore: paginated.status === 'LoadingMore',
    loadOlder: () => paginated.loadMore(MESSAGE_PAGE_SIZE),
  }
}

/**
 * Søgning i hele historikken. Der slås op ved hvert tastetryk, så feltet har
 * en kort pause indbygget -- uden den ville en hel søgestreng koste ét opslag
 * pr. bogstav, hvoraf kun det sidste bruges.
 */
export function useChatSearch(room: ChatRoom, term: string) {
  const trimmed = term.trim()
  const [limit, setLimit] = useState(SEARCH_PAGE_SIZE)

  // En ny søgestreng starter forfra med den lille side.
  useEffect(() => {
    setLimit(SEARCH_PAGE_SIZE)
  }, [trimmed, room])

  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS)
  const result = useQuery(
    api.chat.search,
    debounced.length > 0 ? { room, term: debounced, limit } : 'skip',
  )

  return {
    results: result?.messages ?? [],
    hasMore: result?.hasMore ?? false,
    isSearching:
      trimmed.length > 0 && (debounced !== trimmed || result === undefined),
    loadMore: () =>
      setLimit((current) => Math.min(current + SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE * 2)),
  }
}

/** Beskederne omkring en bestemt besked -- det, et søgeresultat åbner. */
export function useChatContext(messageId: Id<'messages'> | null) {
  return useQuery(
    api.chat.context,
    messageId === null ? 'skip' : { messageId },
  )
}

/** "Online nu" -- dem, der har skrevet heartbeat inden for vinduet. */
export function useOnlineMembers(room: ChatRoom) {
  return useQuery(api.chat.onlineMembers, { room })
}

/** Ulæste beskeder og mentions pr. rum. */
export function useChatUnread(): UnreadSummary[] | undefined {
  return useQuery(api.chat.unread)
}

/**
 * Skriver et heartbeat, så længe chatten er åben, og siger farvel, når den
 * lukkes. Erstatter `supabase.channel(...).track()` fra den gamle app; se
 * kommentaren i `chat.onlineMembers` om, hvad forskellen er.
 */
export function useChatPresence({
  room,
  isAway,
  awayMessage,
}: {
  room: ChatRoom
  isAway: boolean
  awayMessage: string | null
}) {
  const heartbeat = useMutation(api.chat.heartbeat)
  const leave = useMutation(api.chat.leave)

  useEffect(() => {
    const beat = () => {
      void heartbeat({
        room,
        isAway,
        ...(awayMessage ? { awayMessage } : {}),
      }).catch(() => {
        // Et mistet heartbeat er ikke værd at vise; det næste kommer om 30
        // sekunder, og væk-markeringen er flygtig.
      })
    }

    beat()
    const interval = window.setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => {
      window.clearInterval(interval)
      void leave({ room }).catch(() => {})
    }
  }, [room, isAway, awayMessage, heartbeat, leave])
}

export interface SendMessageInput {
  content: string
  replyToMessageId: Id<'messages'> | null
  messageType?: MessageType
  mentions?: Id<'profiles'>[]
}

/**
 * Chatten set fra siden: historikken, offline-køen og de mutationer, der hører
 * til. Svar på en mutation kommer tilbage gennem abonnementet -- der er ingen
 * cache at opdatere med hånden.
 */
export function useMessages(room: ChatRoom, profileId: Id<'profiles'>) {
  const history = useChatHistory(room)
  const sendMessageMutation = useMutation(api.chat.sendMessage)
  const deleteMessageMutation = useMutation(api.chat.softDeleteMessage)
  const toggleReactionMutation = useMutation(api.chat.toggleReaction)
  const createPollMutation = useMutation(api.chatPolls.createPoll)
  const castVoteMutation = useMutation(api.chatPolls.castPollVote)
  const closePollMutation = useMutation(api.chatPolls.closePoll)
  const markRoomRead = useMutation(api.chat.markRoomRead)
  const [sendError, setSendError] = useState<string | null>(null)

  const queuedDraft = useCallback(
    (input: SendMessageInput): QueuedDraft => ({
      profileId,
      room,
      content: input.content,
      messageType: input.messageType ?? 'text',
      mentions: input.mentions ?? [],
      replyToMessageId: input.replyToMessageId,
    }),
    [profileId, room],
  )

  const queue = useChatQueue({
    room,
    profileId,
    send: (entry) =>
      sendMessageMutation({
        clientId: entry.clientId,
        room: entry.room,
        content: entry.content,
        messageType: entry.messageType,
        mentions: entry.mentions,
        replyToMessageId: entry.replyToMessageId,
        writtenAt: entry.writtenAt,
      }),
    deliver: () => {
      // En kvitteret besked betyder, at brugeren står i rummet nu.
      void markRoomRead({ room }).catch(() => {})
    },
  })

  /**
   * Sender en besked -- eller lægger den i køen, hvis den ikke kan komme af
   * sted. Køen er ikke en nødløsning, den er den eneste vej uden forbindelse:
   * `navigator.onLine` kan stå på "online" på en telefon i skoven, og så skal
   * et fejlet kald ikke møde brugeren som et afslag.
   */
  const sendMessage = useCallback(
    async (input: SendMessageInput) => {
      setSendError(null)
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline) {
        await queue.enqueue(queuedDraft(input))
        return { messageId: null, inserted: false }
      }

      // Klient-id'et laves *før* forsøget og bruges også, hvis beskeden ender
      // i køen: så er der intet id at gætte på, hvis det første kald nåede
      // frem, men svaret gik tabt.
      const clientId = newClientId()
      try {
        const result = await sendMessageMutation({
          clientId,
          room,
          content: input.content,
          messageType: input.messageType ?? 'text',
          mentions: input.mentions ?? [],
          replyToMessageId: input.replyToMessageId,
        })
        return { messageId: result.messageId, inserted: result.inserted }
      } catch (error) {
        if (!isRetryableSendError(error)) {
          setSendError(errorText(error))
          throw error
        }
        await queue.enqueue(queuedDraft(input), clientId)
        return { messageId: null, inserted: false }
      }
    },
    [queue, queuedDraft, room, sendMessageMutation],
  )

  const deleteMessage = useCallback(
    (messageId: Id<'messages'>) => deleteMessageMutation({ messageId }),
    [deleteMessageMutation],
  )

  const toggleReaction = useCallback(
    (messageId: Id<'messages'>, emoji: ReactionEmoji) =>
      toggleReactionMutation({ messageId, emoji }),
    [toggleReactionMutation],
  )

  return {
    messages: history.messages,
    isFirstLoad: history.isFirstLoad,
    hasMore: history.hasMore,
    isLoadingMore: history.isLoadingMore,
    loadOlder: history.loadOlder,
    sendMessage,
    sendError,
    deleteMessage,
    toggleReaction,
    createPoll: (messageId: Id<'messages'>, options: string[]) =>
      createPollMutation({ messageId, options }),
    castVote: (pollId: PollId, optionId: PollOptionId) =>
      castVoteMutation({ pollId, optionId }),
    closePoll: (pollId: PollId) => closePollMutation({ pollId }),
    markRoomRead: () => markRoomRead({ room }),
    /** Beskeder, der endnu ikke er bekræftet af serveren. */
    queuedMessages: queue.messages,
    retryQueued: queue.retry,
    discardQueued: queue.discard,
    isOffline: queue.isOffline,
  }
}

/** En værdi, der først slår igennem efter en pause. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])
  return debounced
}
