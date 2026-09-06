-- Spil-sektionen: en fælles resultattabel for appens spil, med Tetris som det
-- første (#202).
--
-- Tabellen er skrevet, så den kan bære flere spil end Tetris uden en ny
-- migration: `game` er en tekstkolonne med en check-constraint, som udvides,
-- når det næste spil kommer. Resultatlisterne slås altid op filtreret på
-- `game`, aldrig på tværs.
--
-- Et resultat er personligt, ikke klubhistorie: bliver medlemmet slettet,
-- forsvinder dets resultater med kontoen (`on delete cascade`), på linje med
-- billeder og tilmeldinger -- til forskel fra begivenheder, beskeder og
-- naturloggen, som bevares uden navn (se 20260823170000_account_deletion.sql).
create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null,
  -- Ryddede rækker (Tetris). Andre spil kan lade den stå på 0.
  lines integer not null default 0,
  level integer not null default 1,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  constraint game_scores_game_known check (game in ('tetris')),
  constraint game_scores_score_range check (score between 0 and 9999999),
  constraint game_scores_lines_range check (lines between 0 and 99999),
  constraint game_scores_level_range check (level between 1 and 99),
  constraint game_scores_duration_range
    check (duration_seconds between 0 and 86400),
  -- Et loft, der fanger vrøvl uden at genere nogen, der rent faktisk spiller.
  -- Klubbens resultatliste er tillidsbaseret -- pointene tælles i browseren og
  -- kan ikke bevises herfra -- men et tal, der er umuligt for antallet af
  -- ryddede rækker (en million point uden en eneste række), skal ikke kunne
  -- lande på listen.
  --
  -- Grænsen er sat generøst i forhold til, hvad Tetris' egen pointtabel kan
  -- give: et bræt fyldt op uden en eneste ryddet række kan maksimalt indbringe
  -- omkring 3.000 point i faldpoint, og et helt spil med lutter T-spins ligger
  -- under det kvadratiske led. Tvivlen kommer spilleren til gode.
  constraint game_scores_score_plausible
    check (score <= 5000 + lines * (1000 + lines * 60))
);

-- Resultatlisten: bedste point først, ældste først ved pointlighed, så den,
-- der nåede tallet først, står øverst.
create index if not exists game_scores_leaderboard_idx
  on public.game_scores (game, score desc, created_at asc);

-- "Seneste spil" og et medlems egne resultater.
create index if not exists game_scores_recent_idx
  on public.game_scores (game, created_at desc);

create index if not exists game_scores_player_idx
  on public.game_scores (player_id, game, score desc);

alter table public.game_scores enable row level security;

-- Resultatlisten er hele pointen: alle indloggede kan læse alle resultater.
drop policy if exists "Authenticated can read game scores"
  on public.game_scores;
create policy "Authenticated can read game scores"
  on public.game_scores for select
  to authenticated
  using (true);

drop policy if exists "Members can record their own game scores"
  on public.game_scores;
create policy "Members can record their own game scores"
  on public.game_scores for insert
  to authenticated
  with check (auth.uid() = player_id);

-- Et resultat er en kendsgerning om et spil, der er spillet -- det kan ikke
-- rettes bagefter, hverken af spilleren selv eller af en admin. Kan man rette
-- sit eget resultat, er listen ingenting værd.
revoke update on public.game_scores from authenticated;

-- Slettes kan det derimod: sit eget (fortrudt) og en admins (moderation),
-- som i galleriet og naturloggen.
drop policy if exists "Players and admins can delete game scores"
  on public.game_scores;
create policy "Players and admins can delete game scores"
  on public.game_scores for delete
  to authenticated
  using (auth.uid() = player_id or public.is_admin());

-- Fortæl medlemmerne, at spillene findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-tetris',
  'Nyt: Spil Tetris mod resten af klubben',
  'Der er kommet en spil-side i menuen. Første spil er Tetris -- spil på telefonen eller med piletasterne, og dit bedste resultat ryger på klubbens resultatliste. Hvor højt kan du komme?',
  'spil'
)
on conflict (slug) do nothing;
