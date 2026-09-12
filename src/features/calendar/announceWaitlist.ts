import { MENTION_LIMIT } from '../chat/mentions'
import type { ProfileSummary } from '../chat/useProfilesMap'
import { announceInChat } from '../profile/announceInChat'

/**
 * Chatbeskederne omkring ventelisten (#222). Samme vej som profilens
 * handlingsbeskeder: "* Navn <content>", sendt af den, hvis handling udløste
 * den. De nævnte medlemmer sendes med som mentions, så de fremhæves og får
 * push gennem chat-push -- også dem, der kun vil have besked, når de nævnes.
 */

export interface MentionedMember {
  id: string
  name: string
}

export type PromotionCause = 'left' | 'capRaised' | 'joined'

/** Navnene, mentions skrives med -- teksten skal matche profilens navn. */
export function mentionedMembers(
  ids: readonly string[],
  profiles: Record<string, ProfileSummary> | undefined,
): MentionedMember[] {
  return ids.map((id) => ({
    id,
    name: profiles?.[id]?.full_name?.trim() || 'Medlem',
  }))
}

/** "@A", "@A og @B", "@A, @B og @C" */
function joinItems(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} og ${items.at(-1)}`
}

function mentionList(members: readonly MentionedMember[]) {
  return members.map((member) => `@${member.name}`)
}

export function promotionAnnouncement(
  cause: PromotionCause,
  eventTitle: string,
  members: readonly MentionedMember[],
): string {
  const names = joinItems(mentionList(members))
  const seat = members.length === 1 ? 'pladsen' : 'plads'
  switch (cause) {
    case 'left':
      return `har meldt afbud til «${eventTitle}», så ${names} har fået ${seat} fra ventelisten`
    case 'capRaised':
      return `har gjort plads til flere på «${eventTitle}»: ${names} har fået plads fra ventelisten`
    case 'joined':
      return `har tilmeldt sig «${eventTitle}» – ${names} har samtidig fået plads fra ventelisten`
  }
}

const startFormatter = new Intl.DateTimeFormat('da-DK', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** "søndag 20. september kl. 10.00" */
export function formatEventStart(startAt: string) {
  return startFormatter.format(new Date(startAt))
}

/**
 * Påmindelsen til dem, der ikke har svaret. Chatten fremhæver højst
 * MENTION_LIMIT mentions pr. besked, så de øvrige tælles i stedet for at
 * blive nævnt.
 */
export function reminderAnnouncement(
  eventTitle: string,
  when: string,
  members: readonly MentionedMember[],
  othersCount: number,
): string {
  const items = mentionList(members)
  if (othersCount > 0) items.push(`${othersCount} andre`)
  return `minder om «${eventTitle}» ${when}: ${joinItems(items)} har ikke svaret endnu. Meld til eller fra i kalenderen.`
}

export function announcePromotion(
  userId: string,
  cause: PromotionCause,
  eventTitle: string,
  promotedIds: readonly string[],
  profiles: Record<string, ProfileSummary> | undefined,
) {
  if (promotedIds.length === 0) return Promise.resolve()
  return announceInChat(
    userId,
    promotionAnnouncement(
      cause,
      eventTitle,
      mentionedMembers(promotedIds, profiles),
    ),
    promotedIds,
  )
}

export function announceReminder(
  userId: string,
  event: { title: string; start_at: string },
  memberIds: readonly string[],
  profiles: Record<string, ProfileSummary> | undefined,
) {
  const mentionedIds = memberIds.slice(0, MENTION_LIMIT)
  return announceInChat(
    userId,
    reminderAnnouncement(
      event.title,
      formatEventStart(event.start_at),
      mentionedMembers(mentionedIds, profiles),
      memberIds.length - mentionedIds.length,
    ),
    mentionedIds,
  )
}
