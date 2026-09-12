// Hvem skal have en notifikation om en ny chatbesked -- og hvordan skal den se
// ud (#179)?
//
// Filtreringen hører hjemme her på serveren og ikke i klienten: en klient kan
// ikke undlade at modtage en notifikation, den allerede har fået, og chat-push
// er det eneste sted, der kan lade være med at sende. Logikken ligger i sin
// egen fil uden Deno- eller npm-afhængigheder, så den kan testes med
// vitest på linje med de øvrige functions.

export const CHAT_NOTIFICATION_PREFERENCES = [
  'all',
  'mentions',
  'none',
] as const

export type ChatNotificationPreference =
  (typeof CHAT_NOTIFICATION_PREFERENCES)[number]

export type ChatRoom = 'general' | 'admin'

/** Ét fælles chatrum -> ét tag, så ubesvarede beskeder erstatter hinanden. */
export const CHAT_TAG = 'naturklubben-chat'

/**
 * Mentions har deres eget tag. Med det almindelige ville den næste besked i
 * chatten erstatte "X nævnte dig" i notifikationsskuffen, og så var pointen
 * med at kunne skrue ned væk igen.
 */
export const MENTION_TAG = 'naturklubben-chat-mention'

/**
 * Admin-rummet (#212) har sine egne tags og sin egen sti: en notifikation
 * derfra må ikke erstatte -- eller blive erstattet af -- en fra det fælles
 * rum, og tryk på den skal åbne admin-chatten, ikke den almindelige.
 */
export const ADMIN_CHAT_TAG = 'naturklubben-chat-admin'
export const ADMIN_MENTION_TAG = 'naturklubben-chat-admin-mention'

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface ChatPushRecipient {
  subscription: PushSubscriptionRow
  isMentioned: boolean
}

export function normalizePreference(
  value: unknown,
): ChatNotificationPreference {
  return CHAT_NOTIFICATION_PREFERENCES.includes(
    value as ChatNotificationPreference,
  )
    ? (value as ChatNotificationPreference)
    : 'all'
}

/**
 * Abonnementerne, der skal have besked. Afsenderen får aldrig noget -- heller
 * ikke på sin anden enhed -- og et medlem uden en gemt præference behandles
 * som "alle beskeder", så en manglende række ikke gør chatten tavs.
 */
export function selectRecipients({
  subscriptions,
  preferences,
  mentionedIds,
  senderId,
  room = 'general',
  adminIds,
}: {
  subscriptions: readonly PushSubscriptionRow[]
  preferences: ReadonlyMap<string, ChatNotificationPreference>
  mentionedIds: readonly string[]
  senderId: string
  room?: ChatRoom
  /** Kun nødvendig for admin-rummet -- ignoreres for det fælles rum. */
  adminIds?: ReadonlySet<string>
}): ChatPushRecipient[] {
  const mentioned = new Set(mentionedIds)
  const recipients: ChatPushRecipient[] = []

  for (const subscription of subscriptions) {
    if (subscription.user_id === senderId) continue
    if (room === 'admin' && !adminIds?.has(subscription.user_id)) continue
    const isMentioned = mentioned.has(subscription.user_id)
    const preference = preferences.get(subscription.user_id) ?? 'all'
    if (preference === 'none') continue
    if (preference === 'mentions' && !isMentioned) continue
    recipients.push({ subscription, isMentioned })
  }

  return recipients
}

export function chatPushPayload({
  senderName,
  preview,
  messageId,
  isMentioned,
  room = 'general',
}: {
  senderName: string | null | undefined
  preview: string
  messageId: string
  isMentioned: boolean
  room?: ChatRoom
}): string {
  const name = senderName?.trim()
  const tag =
    room === 'admin'
      ? isMentioned
        ? ADMIN_MENTION_TAG
        : ADMIN_CHAT_TAG
      : isMentioned
        ? MENTION_TAG
        : CHAT_TAG
  return JSON.stringify({
    title: isMentioned
      ? name
        ? `${name} nævnte dig`
        : 'Du er nævnt i Naturklubben'
      : name || 'Ny besked i Naturklubben',
    body: preview,
    tag,
    path: room === 'admin' ? 'admin/chat' : 'chat',
    messageId,
  })
}
