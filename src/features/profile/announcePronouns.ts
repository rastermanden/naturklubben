import { supabase } from '../../lib/supabaseClient'
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

/**
 * Fortæller de andre om skiftet ad den vej, de allerede kender: en
 * handlingsbesked i chatten (som "/slap") og en push-notifikation gennem
 * chat-push, der selv respekterer hvert medlems notifikationsvalg.
 *
 * Bedste indsats, ligesom notifikationen efter en almindelig besked: profilen
 * er allerede gemt, så en fejl her må ikke ligne, at gemningen slog fejl.
 */
export async function announcePronouns(userId: string, pronouns: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      user_id: userId,
      content: pronounsAnnouncement(pronouns),
      message_type: 'action',
    })
    .select('id')
    .single()
  if (error) {
    console.warn('Pronomin-beskeden kunne ikke sendes til chatten', error)
    return
  }
  const { error: pushError } = await supabase.functions.invoke('chat-push', {
    body: { messageId: data.id },
  })
  if (pushError) console.warn('Notifikationer kunne ikke sendes', pushError)
}
