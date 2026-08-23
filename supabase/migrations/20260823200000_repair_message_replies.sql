-- Reparation: svar-kolonnen og dens foreign key nåede aldrig produktion (#94).
--
-- 20260823162000_message_replies.sql blev merget i #94 *efter* #99, som
-- allerede havde lagt 20260823170000 og 20260823170100 på produktionen.
-- Svar-migrationens versionsnummer var dermed lavere end det senest kørte,
-- og den blev ikke anvendt. Det viste sig ikke på PR'ens Preview Branch,
-- fordi en preview-database er tom og afspiller *alle* migrationer forfra i
-- filnavnsorden -- der er ingen "senest kørte" at ligge under. Fejlen kunne
-- derfor kun opstå på den database, der opdateres trinvist: produktionen.
--
-- Symptomet var, at hele chatten holdt op med at kunne hentes:
--
--   PGRST200: Could not find a relationship between 'messages' and 'messages'
--   in the schema cache ... using the hint 'messages_reply_to_message_id_fkey'
--
-- useMessages embedder svarets ophav med netop det constraint-navn som hint,
-- så uden foreign key'en fejler *hele* beskedforespørgslen -- ikke kun svar.
--
-- Filen her gentager præcis samme DDL under et versionsnummer, der er højere
-- end alt hidtil kørt. Alle trin er betingede, så den er et rent nul-arbejde
-- på enhver database, hvor 20260823162000 nåede at køre (preview-branches og
-- friske databaser). Den oprindelige migration bliver bevidst liggende: en
-- omdøbning ville efterlade databaser, der *har* kørt 20260823162000, med en
-- historik, der peger på en fil, som ikke findes mere, og det brækker senere
-- migrationskørsler.

alter table public.messages
  add column if not exists reply_to_message_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_reply_to_message_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_reply_to_message_id_fkey
        foreign key (reply_to_message_id)
        references public.messages (id)
        on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_cannot_reply_to_self'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_cannot_reply_to_self
        check (reply_to_message_id is null or reply_to_message_id <> id);
  end if;
end
$$;

create index if not exists messages_reply_to_message_id_idx
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;
