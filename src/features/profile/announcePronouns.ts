import { announceInChat } from './announceInChat'
import { displayPronouns } from './pronouns'

/**
 * Skal de andre have besked om et pronomin-skift?
 *
 * Kun når der er noget nyt at fortælle: første gang man vælger, og når man
 * skifter. At fjerne sine pronominer eller vælge "vil ikke oplyse" giver ingen
 * besked -- "* Bo har ingen pronominer længere" ville pege på noget, ingen
 * skal lægge mærke til.
 */
export function shouldAnnouncePronouns(
  previous: string | null,
  next: string | null,
): boolean {
  const shown = displayPronouns(next)
  return shown !== null && next !== previous
}

/** Chattens handlingsbesked: vises som "* Navn bruger nu pronominerne X". */
export function pronounsAnnouncement(pronouns: string): string {
  return `bruger nu pronominerne ${pronouns}`
}

export function announcePronouns(userId: string, pronouns: string) {
  return announceInChat(userId, pronounsAnnouncement(pronouns))
}
