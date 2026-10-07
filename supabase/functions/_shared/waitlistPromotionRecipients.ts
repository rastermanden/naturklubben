// Hvem må klienten reelt melde som "rykket op fra ventelisten" (#236)?
//
// Klienten sender kun de id'er, `respond_to_event`/`promote_event_waitlist`
// selv gav den tilbage -- men functionen stoler ikke på den liste blindt: et
// medlem med ondt i sinden kunne ellers bede om at få sendt "du har fået en
// plads" til vilkårlige id'er. Derfor snævres listen ind til dem, der rent
// faktisk sidder på en `attending`-plads til netop denne begivenhed lige nu.
// I værste fald får en, der allerede deltog, en overflødig (men harmløs og
// kun én gang nogensinde, jf. `push_deliveries`) besked om det -- listen kan
// aldrig pege på en, der er uden for begivenheden.
//
// Opslaget ligger her for sig, ligesom eventReminderRecipients.ts, så det kan
// testes med `deno test` mod en klient, der filtrerer som PostgREST.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3'

export async function loadWaitlistPromotionRecipients(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  eventId: string,
  candidateIds: readonly string[],
): Promise<string[]> {
  const candidates = [...new Set(candidateIds)]
  if (candidates.length === 0) return []

  const { data, error } = await supabase
    .from('event_attendance')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('status', 'attending')
    .in('user_id', candidates)
  if (error) throw error
  return (data ?? []).map((row) => row.user_id as string)
}
