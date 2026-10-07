import { supabase } from '../../lib/supabaseClient'

/**
 * Fortæller de andre om noget på profilen ad den vej, de allerede kender: en
 * handlingsbesked i chatten (som "/slap", vises som "* Navn <content>") og en
 * push-notifikation gennem chat-push, der selv respekterer hvert medlems
 * notifikationsvalg.
 *
 * Bedste indsats, ligesom notifikationen efter en almindelig besked: profilen
 * er allerede gemt, så en fejl her må ikke ligne, at gemningen slog fejl.
 *
 * `mentions` er id'erne på dem, beskeden nævner med @ -- de bliver fremhævet
 * i chatten og får push, selv om de har slået almindelige beskeder fra.
 * Kalenderen bruger det til at nå dem, der har fået en plads fra ventelisten.
 *
 * `messageType` er 'action' ("* Navn <content>") medmindre beskeden ikke
 * handler om afsenderen selv -- så sendes den som almindelig tekst.
 *
 * Returnerer, om beskeden kom i chatten. Push er stadig bedste indsats: en
 * fejl dér ændrer ikke, at beskeden er sendt.
 */
export async function announceInChat(
  userId: string,
  content: string,
  mentions: readonly string[] = [],
  messageType: 'action' | 'text' = 'action',
): Promise<boolean> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      user_id: userId,
      content,
      message_type: messageType,
      mentions: [...mentions],
    })
    .select('id')
    .single()
  if (error) {
    console.warn('Beskeden kunne ikke sendes til chatten', error)
    return false
  }
  const { error: pushError } = await supabase.functions.invoke('chat-push', {
    body: { messageId: data.id },
  })
  if (pushError) console.warn('Notifikationer kunne ikke sendes', pushError)
  return true
}
