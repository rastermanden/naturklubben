-- Reaktioner på chatbeskeder (#105, delopgave af #84).
--
-- Primærnøglen (message_id, user_id, emoji) håndhæver "én af hver reaktion pr.
-- bruger pr. besked" i databasen frem for i UI'et. Den er samtidig
-- REPLICA IDENTITY for tabellen, så et Realtime-DELETE bærer alle tre
-- kolonner med i `old` -- klienten kan fjerne den rigtige reaktion uden et
-- ekstra opslag.
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- Fast emoji-sæt. Fri emoji ville kræve en picker (tung på mobil) og gøre
-- aggregeringen uforudsigelig. Sættet kan udvides med en senere migration --
-- constraint'en droppes og genskabes, uden at eksisterende rækker rører sig.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'message_reactions_emoji_check'
      and conrelid = 'public.message_reactions'::regclass
  ) then
    alter table public.message_reactions
      add constraint message_reactions_emoji_check
        check (emoji in ('👍', '❤️', '😂', '😮', '🙏'));
  end if;
end
$$;

-- Opslaget går altid "alle reaktioner for disse beskeder". Primærnøglens
-- indeks har message_id først og dækker derfor allerede det opslag; et
-- selvstændigt indeks ville kun være dødvægt ved skrivning.

alter table public.message_reactions enable row level security;

-- Samme læseadgang som beskederne selv: rummet er fælles for alle medlemmer.
drop policy if exists "Authenticated can read reactions"
  on public.message_reactions;
create policy "Authenticated can read reactions"
  on public.message_reactions for select
  to authenticated
  using (true);

-- Man kan kun reagere som sig selv og kun fjerne sin egen reaktion. Ingen
-- update-policy: en reaktion ændres ikke, den fjernes og sættes på ny.
drop policy if exists "Members can add own reactions"
  on public.message_reactions;
create policy "Members can add own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members can remove own reactions"
  on public.message_reactions;
create policy "Members can remove own reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- I modsætning til messages.user_id, som bevidst blev "on delete set null" i
-- #99 (historikken består anonymiseret), er en reaktion personlig og
-- meningsløs uden sin afsender: foreign key'en ovenfor kaskaderer, så
-- kontosletning fjerner den, som den fjerner push_subscriptions.

-- Reaktioner skal tikke ind live på samme måde som beskeder.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;
