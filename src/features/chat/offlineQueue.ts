// Køen af beskeder, der endnu ikke er nået serveren (#219).
//
// Al logik her er rene funktioner på en liste af `QueuedMessage`: de læser og
// skriver ikke IndexedDB, rører ikke netværket og kender ikke `navigator`. Det
// er med vilje -- det er den del, der kan testes uden browser-API'er, og den
// eneste del af offline-køen, hvor en fejl ville give tabte eller dublerede
// beskeder.
import type { ChatRoom, MessageType } from './useMessages'

/**
 * Hvor mange gange et forsøg må gentages automatisk. Derefter står beskeden
 * stille med "Prøv igen", så en besked, serveren konsekvent afviser, ikke bliver
 * ved med at hamre på API'et i det uendelige.
 */
export const MAX_SEND_ATTEMPTS = 5

export type QueuedMessageStatus = 'queued' | 'sending' | 'failed'

export interface QueuedMessage {
  /**
   * Klientens eget id. Det bliver beskedens id på serveren, så en gentagelse
   * rammer primærnøglen og ikke kan give en dublet (se
   * 20260917090000_chat_offline_queue.sql).
   */
  clientId: string
  userId: string
  room: ChatRoom
  content: string
  messageType: MessageType
  mentions: string[]
  replyToMessageId: string | null
  /** Tidspunktet, brugeren skrev beskeden -- ikke tidspunktet, den blev sendt. */
  writtenAt: string
  status: QueuedMessageStatus
  attempts: number
  lastError: string | null
}

/** Det, en klient lægger i køen. Resten af felterne sættes af `createQueuedMessage`. */
export interface QueuedDraft {
  userId: string
  room: ChatRoom
  content: string
  messageType?: MessageType
  mentions?: string[]
  replyToMessageId?: string | null
}

export function createQueuedMessage(
  draft: QueuedDraft,
  clientId: string,
  writtenAt: string,
): QueuedMessage {
  return {
    clientId,
    userId: draft.userId,
    room: draft.room,
    content: draft.content,
    messageType: draft.messageType ?? 'text',
    mentions: draft.mentions ?? [],
    replyToMessageId: draft.replyToMessageId ?? null,
    writtenAt,
    status: 'queued',
    attempts: 0,
    lastError: null,
  }
}

/** Køen holdes i skrive-rækkefølge: ældste besked først. */
export function sortQueue(queue: readonly QueuedMessage[]): QueuedMessage[] {
  return [...queue].sort(
    (left, right) =>
      left.writtenAt.localeCompare(right.writtenAt) ||
      left.clientId.localeCompare(right.clientId),
  )
}

export function enqueueMessage(
  queue: readonly QueuedMessage[],
  message: QueuedMessage,
): QueuedMessage[] {
  if (queue.some((entry) => entry.clientId === message.clientId)) {
    return [...queue]
  }
  return sortQueue([...queue, message])
}

/** Fletter to lister sammen uden at tabe eller fordoble nogen. */
export function mergeQueues(
  current: readonly QueuedMessage[],
  incoming: readonly QueuedMessage[],
): QueuedMessage[] {
  const known = new Set(current.map((entry) => entry.clientId))
  return sortQueue([
    ...current,
    ...incoming.filter((entry) => !known.has(entry.clientId)),
  ])
}

export function removeQueuedMessage(
  queue: readonly QueuedMessage[],
  clientId: string,
): QueuedMessage[] {
  return queue.filter((entry) => entry.clientId !== clientId)
}

function replace(
  queue: readonly QueuedMessage[],
  clientId: string,
  update: (entry: QueuedMessage) => QueuedMessage,
): QueuedMessage[] {
  return queue.map((entry) =>
    entry.clientId === clientId ? update(entry) : entry,
  )
}

export function markMessageSending(
  queue: readonly QueuedMessage[],
  clientId: string,
): QueuedMessage[] {
  return replace(queue, clientId, (entry) => ({
    ...entry,
    status: 'sending',
  }))
}

export function markMessageFailed(
  queue: readonly QueuedMessage[],
  clientId: string,
  error: string,
): QueuedMessage[] {
  return replace(queue, clientId, (entry) => ({
    ...entry,
    status: 'failed',
    attempts: entry.attempts + 1,
    lastError: error,
  }))
}

/** "Prøv igen": beskeden stilles tilbage, som da den blev skrevet. */
export function resumeQueuedMessage(
  queue: readonly QueuedMessage[],
  clientId: string,
): QueuedMessage[] {
  return replace(queue, clientId, (entry) => ({
    ...entry,
    status: 'queued',
    attempts: 0,
    lastError: null,
  }))
}

/**
 * En app, der blev lukket midt i en afsendelse, efterlader en besked som
 * `sending` i IndexedDB. Den er ikke undervejs længere -- ingen sender den --
 * så den skal tilbage i køen, når den læses ind igen.
 */
export function resumeInterruptedQueue(
  queue: readonly QueuedMessage[],
): QueuedMessage[] {
  return queue.map((entry) =>
    entry.status === 'sending'
      ? { ...entry, status: 'queued' as const }
      : entry,
  )
}

/**
 * Den næste besked, der må sendes for den pågældende bruger i det rum, man
 * står i.
 *
 * Køen deles i IndexedDB mellem alle rum, men hvert rums instans af
 * `useChatQueue` tømmer kun sit eget: en besked fra et andet rum (fx skrevet
 * i admin-chatten, mens man senere står i den almindelige) sendes først, når
 * man igen er i det rum. Ellers ville den blive leveret til det forkerte
 * rums cache, og en fejlende besked i ét rum ville blokere et andet.
 *
 * Køen kan desuden indeholde beskeder fra en tidligere session på samme
 * maskine (en anden bruger, der er logget ud, før køen blev tømt). De må ikke
 * sendes med den nuværende brugers token -- serveren sætter afsenderen til
 * den, der kalder -- så de springes over indtil den bruger logger ind igen.
 */
export function nextSendableMessage(
  queue: readonly QueuedMessage[],
  userId: string,
  room: ChatRoom,
): QueuedMessage | undefined {
  return sortQueue(queue).find(
    (entry) =>
      entry.userId === userId &&
      entry.room === room &&
      entry.status !== 'sending' &&
      entry.attempts < MAX_SEND_ATTEMPTS,
  )
}

export function queueForRoom(
  queue: readonly QueuedMessage[],
  room: ChatRoom,
  userId: string,
): QueuedMessage[] {
  return sortQueue(queue).filter(
    (entry) => entry.room === room && entry.userId === userId,
  )
}

/**
 * Beskeder, der allerede står i historikken, skal ikke vises som ventende.
 *
 * Det rammer det tilfælde, hvor beskeden blev sendt, men svaret gik tabt: den
 * ligger stadig i køen, mens Realtime (eller en hentning) allerede har leveret
 * rækken. Id'et er det samme i de to, netop fordi klienten gav beskeden sit id.
 */
export function dropDeliveredMessages(
  queue: readonly QueuedMessage[],
  messages: readonly { id: string }[],
): QueuedMessage[] {
  const delivered = new Set(messages.map((message) => message.id))
  return queue.filter((entry) => !delivered.has(entry.clientId))
}

export function isQueued(
  queue: readonly QueuedMessage[],
  clientId: string,
): boolean {
  return queue.some((entry) => entry.clientId === clientId)
}

const RETRYABLE_NETWORK_PATTERN =
  /failed to fetch|fetch failed|load failed|network ?error|network request failed|network connection|err_internet|err_network|err_connection|econn|enotfound|etimedout|abort|timeout|timed out|service unavailable|bad gateway|gateway timeout|temporarily unavailable/i

/**
 * Skal fejlen lægges i køen, eller skal brugeren have den at se?
 *
 * Uden forbindelse er svaret givet på forhånd, men en telefon i skoven står
 * typisk med `navigator.onLine === true` og alligevel ingen brugbar forbindelse:
 * forespørgslen når aldrig frem, og supabase-js svarer med en fejl, hvis tekst
 * kommer fra selve `fetch` ("TypeError: Failed to fetch", med stack i
 * `details`). Den slags -- og 5xx fra serveren -- er værd at prøve igen.
 *
 * Alt andet (en afvist politik, et brudt check-constraint, en udløbet session)
 * bliver ved med at fejle, og så skal beskeden ikke stå og vente i det uendelige.
 */
export function isRetryableSendError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError')
      return true
    if (error instanceof TypeError) return true
    if (RETRYABLE_NETWORK_PATTERN.test(error.message)) return true
  }

  if (typeof error === 'string') return RETRYABLE_NETWORK_PATTERN.test(error)

  if (typeof error === 'object' && error !== null) {
    const details = error as {
      message?: unknown
      details?: unknown
      status?: unknown
    }
    if (
      typeof details.status === 'number' &&
      (details.status === 0 ||
        details.status === 408 ||
        details.status === 429 ||
        details.status >= 500)
    ) {
      return true
    }
    const text = [details.message, details.details]
      .filter((part): part is string => typeof part === 'string')
      .join(' ')
    return RETRYABLE_NETWORK_PATTERN.test(text)
  }

  return false
}

/** Kort, læsbar tekst til den fejlede besked -- og til skærmlæseren. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null) {
    const { message, details } = error as {
      message?: unknown
      details?: unknown
    }
    if (typeof message === 'string' && message.trim()) return message
    if (typeof details === 'string' && details.trim()) return details
  }
  return 'Ukendt fejl'
}
