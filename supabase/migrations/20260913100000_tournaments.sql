-- Turneringsstyring (#229): bøssetennisgolf-turneringer med op til ca. 8
-- deltagere. Alle-mod-alle med en løbende stillingstabel, eller single
-- elimination med automatisk bye i runde 1.
--
-- Deltagere er registrerede medlemmer, ikke frie navne -- `user_id` peger på
-- profiles. Navnet snapshottes alligevel i `display_name` ved oprettelse, så
-- en tidligere turnerings deltagerliste og kampe stadig viser et navn, selv
-- hvis medlemmet siden sletter sin konto (samme grundtanke som events og
-- observations: indholdet bevares, referencen til brugeren kan forsvinde).
--
-- Det er et fælles værktøj til én turneringsdag: alle autentificerede
-- medlemmer må læse og redigere alt (deltagere, kampe, resultater), så flere
-- kan hjælpe med at taste resultater ind fra hver sin telefon. Kun selve
-- oprettelsen af en turnering er bundet til opretteren (auth.uid() =
-- created_by), så historikken kan vise, hvem der satte den i gang.
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  format text not null check (format in ('round_robin', 'single_elimination')),
  status text not null default 'setup'
    check (status in ('setup', 'in_progress', 'completed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 80),
  -- Bruges til at generere kampplan/bracket i en stabil, aftalt rækkefølge.
  seed integer not null check (seed >= 1),
  unique (tournament_id, user_id),
  unique (tournament_id, seed)
);

create index tournament_participants_tournament_idx
  on public.tournament_participants (tournament_id);

-- En kamp er altid best of three enkeltspil. `round`/`match_index` giver
-- kampplanen en stabil rækkefølge (round robin bruger kun round 1). Ved
-- single elimination peger `next_match_id`/`next_match_slot` på, hvor
-- vinderen rykker hen -- det er sådan bracketten hænger sammen uden at
-- skulle genberegnes ved hvert resultat.
create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round integer not null default 1 check (round >= 1),
  match_index integer not null check (match_index >= 0),
  participant1_id uuid
    references public.tournament_participants (id) on delete cascade,
  -- Er participant2_id tom og kampen straks 'completed', er det en bye.
  participant2_id uuid
    references public.tournament_participants (id) on delete cascade,
  winner_id uuid
    references public.tournament_participants (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  next_match_id uuid
    references public.tournament_matches (id) on delete set null,
  next_match_slot smallint check (next_match_slot in (1, 2)),
  unique (tournament_id, round, match_index),
  constraint tournament_matches_winner_is_a_participant
    check (
      winner_id is null
      or winner_id = participant1_id
      or winner_id = participant2_id
    ),
  -- "is distinct from" ville afvise en kamp, hvor begge pladser stadig
  -- venter (begge null, fx finalen før semifinalerne er spillet) -- kun et
  -- fælles, udfyldt id skal afvises.
  constraint tournament_matches_distinct_participants
    check (
      participant1_id is null
      or participant2_id is null
      or participant1_id <> participant2_id
    ),
  constraint tournament_matches_status_matches_winner
    check ((status = 'completed') = (winner_id is not null))
);

create index tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id, round, match_index);

create table public.tournament_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.tournament_matches (id) on delete cascade,
  game_number smallint not null check (game_number between 1 and 3),
  winner_id uuid not null
    references public.tournament_participants (id) on delete cascade,
  unique (match_id, game_number)
);

create index tournament_games_match_idx
  on public.tournament_games (match_id);

alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_games enable row level security;

create policy "Authenticated can read tournaments"
  on public.tournaments for select
  to authenticated
  using (true);

create policy "Members can create tournaments"
  on public.tournaments for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Members can update tournaments"
  on public.tournaments for update
  to authenticated
  using (true)
  with check (true);

create policy "Members can delete tournaments"
  on public.tournaments for delete
  to authenticated
  using (true);

create policy "Authenticated can read tournament participants"
  on public.tournament_participants for select
  to authenticated
  using (true);

create policy "Members can manage tournament participants"
  on public.tournament_participants for insert
  to authenticated
  with check (true);

create policy "Members can update tournament participants"
  on public.tournament_participants for update
  to authenticated
  using (true)
  with check (true);

create policy "Members can delete tournament participants"
  on public.tournament_participants for delete
  to authenticated
  using (true);

create policy "Authenticated can read tournament matches"
  on public.tournament_matches for select
  to authenticated
  using (true);

create policy "Members can create tournament matches"
  on public.tournament_matches for insert
  to authenticated
  with check (true);

create policy "Members can update tournament matches"
  on public.tournament_matches for update
  to authenticated
  using (true)
  with check (true);

create policy "Members can delete tournament matches"
  on public.tournament_matches for delete
  to authenticated
  using (true);

create policy "Authenticated can read tournament games"
  on public.tournament_games for select
  to authenticated
  using (true);

create policy "Members can record tournament games"
  on public.tournament_games for insert
  to authenticated
  with check (true);

create policy "Members can update tournament games"
  on public.tournament_games for update
  to authenticated
  using (true)
  with check (true);

create policy "Members can delete tournament games"
  on public.tournament_games for delete
  to authenticated
  using (true);

-- Platformen giver ikke længere API-rollerne adgang til nye tabeller via
-- default-privilegier (se 20260911120000_explicit_api_grants.sql) -- hver ny
-- tabel skal skrive sine egne grants. anon får tabelrettighederne på linje
-- med fx events/activities, selvom ingen policy peger på anon: uden grant
-- fejler et anonymt kald hårdt ("permission denied"), i stedet for at RLS'en
-- stille filtrerer alt væk (0 rækker), som resten af appen forventer.
grant select, insert, update, delete
  on table public.tournaments to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.tournament_participants to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.tournament_matches to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.tournament_games to anon, authenticated, service_role;

insert into public.feature_announcements (slug, title, body, path)
values (
  'turneringsstyring',
  'Ny side: styr klubbens turneringer',
  'Under Turnering kan du oprette en turnering med alle-mod-alle eller '
  || 'udslagsrunder, vælge deltagere blandt medlemmerne og taste resultater '
  || 'ind kamp for kamp, mens I spiller.',
  'turnering'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
