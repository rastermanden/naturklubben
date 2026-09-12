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

/**
 * Chatten fremhæver højst MENTION_LIMIT mentions pr. besked (og databasen
 * afviser flere), så de forreste nævnes, og resten tælles.
 */
function mentionable(ids: readonly string[]) {
  const mentionedIds = ids.slice(0, MENTION_LIMIT)
  return { mentionedIds, othersCount: ids.length - mentionedIds.length }
}

/** "@A", "@A og @B", "@A, @B og 3 andre" */
function mentionList(members: readonly MentionedMember[], othersCount = 0) {
  const items = members.map((member) => `@${member.name}`)
  if (othersCount > 0) items.push(`${othersCount} andre`)
  return items
}

export function promotionAnnouncement(
  cause: PromotionCause,
  eventTitle: string,
  members: readonly MentionedMember[],
  othersCount = 0,
): string {
  const items = mentionList(members, othersCount)
  const names = joinItems(items)
  const seat = items.length === 1 ? 'pladsen' : 'plads'
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

/** Påmindelsen til dem, der ikke har svaret. */
export function reminderAnnouncement(
  eventTitle: string,
  when: string,
  members: readonly MentionedMember[],
  othersCount: number,
): string {
  const items = mentionList(members, othersCount)
  return `minder om «${eventTitle}» ${when}: ${joinItems(items)} har ikke svaret endnu. Meld til eller fra i kalenderen.`
}

export function announcePromotion(
  userId: string,
  cause: PromotionCause,
  eventTitle: string,
  promotedIds: readonly string[],
  profiles: Record<string, ProfileSummary> | undefined,
) {
  if (promotedIds.length === 0) return Promise.resolve(true)
  const { mentionedIds, othersCount } = mentionable(promotedIds)
  return announceInChat(
    userId,
    promotionAnnouncement(
      cause,
      eventTitle,
      mentionedMembers(mentionedIds, profiles),
      othersCount,
    ),
    mentionedIds,
  )
}

export function announceReminder(
  userId: string,
  event: { title: string; start_at: string },
  memberIds: readonly string[],
  profiles: Record<string, ProfileSummary> | undefined,
) {
  const { mentionedIds, othersCount } = mentionable(memberIds)
  return announceInChat(
    userId,
    reminderAnnouncement(
      event.title,
      formatEventStart(event.start_at),
      mentionedMembers(mentionedIds, profiles),
      othersCount,
    ),
    mentionedIds,
  )
}
