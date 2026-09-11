import { supabase } from '../../lib/supabaseClient'

/**
 * Fortæller de andre om noget på profilen ad den vej, de allerede kender: en
 * handlingsbesked i chatten (som "/slap", vises som "* Navn <content>") og en
 * push-notifikation gennem chat-push, der selv respekterer hvert medlems
 * notifikationsvalg.
 *
 * Bedste indsats, ligesom notifikationen efter en almindelig besked: profilen
 * er allerede gemt, så en fejl her må ikke ligne, at gemningen slog fejl.
 */
export async function announceInChat(userId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: userId, content, message_type: 'action' })
    .select('id')
    .single()
  if (error) {
    console.warn('Beskeden kunne ikke sendes til chatten', error)
    return
  }
  const { error: pushError } = await supabase.functions.invoke('chat-push', {
    body: { messageId: data.id },
  })
  if (pushError) console.warn('Notifikationer kunne ikke sendes', pushError)
}
