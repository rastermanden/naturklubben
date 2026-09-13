// Hvem skal have påmindelsen dagen før (#216)?
//
// Kun de medlemmer, der har en plads. Siden #222 står afbud og ventelisten i
// samme tabel som tilmeldingerne, og payloaden siger "Du er tilmeldt" -- den
// må hverken nå en, der har meldt afbud, eller en, der venter på en plads.
// Opslaget ligger her for sig, så det kan testes med `deno test` mod en
// klient, der filtrerer som PostgREST.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3'

export async function loadEventReminderRecipients(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  eventId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('event_attendance')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('status', 'attending')
  if (error) throw error
  return (data ?? []).map((row) => row.user_id as string)
}
