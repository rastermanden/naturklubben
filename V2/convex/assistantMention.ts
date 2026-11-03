/**
 * Om en chatbesked skal give assistenten en mail.
 *
 * Profilen er altid kontoen `naturklubben-test@agentmail.to`. Modtageren af
 * mailen er en anden indstilling (`ASSISTANT_MENTION_EMAIL`) og kan pege på
 * en anden indbakke. Et medlem nævner assistenten enten ved at vælge profilen
 * eller ved at skrive "Grok", "Grok Bot" eller "@Grok" som hele ord.
 * Assistentens egne beskeder giver ingen mail.
 */

/** Kontoen, hvis profil der genkendes. Ikke nødvendigvis mailens modtager. */
export const DEFAULT_ASSISTANT_EMAIL = 'naturklubben-test@agentmail.to'

const ASSISTANT_WORD = /(?<![\p{L}\p{N}_])@?grok(?:\s+bot)?(?![\p{L}\p{N}_])/iu

export function assistantProfileEmail(): string {
  return DEFAULT_ASSISTANT_EMAIL
}

/** Modtageren. Uden en gyldig overstyring bruges assistentens egen adresse. */
export function assistantMentionEmail(override: string | undefined): string {
  const trimmed = override?.trim().toLowerCase()
  if (trimmed && /^[^\s@]+@[^\s@]+$/.test(trimmed)) return trimmed
  return DEFAULT_ASSISTANT_EMAIL
}

export function mentionsAssistantText(content: string): boolean {
  return ASSISTANT_WORD.test(content)
}

export function messageMentionsAssistant(input: {
  content: string
  mentionIds: readonly string[]
  assistantProfileId: string | null
  authorProfileId: string
}): boolean {
  if (
    input.assistantProfileId !== null &&
    input.authorProfileId === input.assistantProfileId
  ) {
    return false
  }
  if (
    input.assistantProfileId !== null &&
    input.mentionIds.includes(input.assistantProfileId)
  ) {
    return true
  }
  return mentionsAssistantText(input.content)
}

export function chatLink(siteUrl: string, room: 'general' | 'admin'): string {
  const base = siteUrl.replace(/\/$/, '')
  return `${base}${room === 'admin' ? '/admin/chat' : '/chat'}`
}

export function roomLabel(room: 'general' | 'admin'): string {
  return room === 'admin' ? 'Admin-chat' : 'Chat'
}

export function formatChatTime(ms: number): string {
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms))
}

export function assistantMentionMail(input: {
  room: 'general' | 'admin'
  authorName: string
  createdAt: number
  content: string
  siteUrl: string
}): { subject: string; text: string; html: string } {
  const room = roomLabel(input.room)
  const when = formatChatTime(input.createdAt)
  const link = chatLink(input.siteUrl, input.room)
  const subject = `Omtale i ${room}`
  const text = [
    `${input.authorName} nævnte dig i ${room}.`,
    when,
    '',
    input.content,
    '',
    link,
  ].join('\n')
  const html = `<!doctype html><html lang="da"><body><p><strong>${escapeHtml(input.authorName)}</strong> nævnte dig i ${escapeHtml(room)}.</p><p>${escapeHtml(when)}</p><p>${escapeHtml(input.content).replaceAll('\n', '<br>')}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p></body></html>`
  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
