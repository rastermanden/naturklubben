import { announceInChat } from './announceInChat'
import { selectedCauses, type Cause } from './causes'

/**
 * De mærker, der er kommet til siden sidst -- dem er der noget at fortælle
 * om. At tage et mærke ned giver ingen besked, af samme grund som for
 * pronominer: det ville pege på noget, ingen skal lægge mærke til.
 */
export function addedCauses(
  previous: readonly string[],
  next: readonly string[],
): Cause[] {
  const before = new Set(previous)
  return selectedCauses(next).filter((cause) => !before.has(cause.slug))
}

/** "🇺🇦", "🇺🇦 og 🏳️‍🌈", "🇺🇦, 🏳️‍🌈 og 💉" */
function listEmojis(causes: readonly Cause[]): string {
  const emojis = causes.map((cause) => cause.emoji)
  if (emojis.length <= 1) return emojis.join('')
  return `${emojis.slice(0, -1).join(', ')} og ${emojis.at(-1)}`
}

/** Chattens handlingsbesked: vises som "* Navn har sat 🇺🇦 ved sit navn". */
export function causesAnnouncement(added: readonly Cause[]): string {
  return `har sat ${listEmojis(added)} ved sit navn`
}

export function announceCauses(userId: string, added: readonly Cause[]) {
  return announceInChat(userId, causesAnnouncement(added))
}
