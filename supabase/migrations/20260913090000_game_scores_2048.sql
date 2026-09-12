-- Spil nummer tre: 2048.
--
-- `game_scores` bærer flere spil (se 20260906090000_game_scores.sql og
-- 20260910090000_game_scores_kaper.sql): `game` udvides her, og
-- rimelighedsgrænsen på pointene får en gren for 2048. Kolonnerne genbruges
-- med hver sin betydning -- for 2048 er `lines` antal træk og `level` den
-- største briks eksponent (11 er 2048), mens `duration_seconds` er som altid.
--
-- Grænsen for 2048 er selvstændig og står ikke i forhold til antallet af
-- træk: et træk kan lægge op til otte par sammen, og det giver ikke nogen
-- brugbar linje. I stedet gælder et 4×4-bræts teoretiske maksimum. En brik på
-- 2^n bygget af lutter 2'ere har indbragt (n - 1) · 2^n point, og den største
-- brik, der overhovedet kan opstå på seksten felter, er 2^17 = 131072. Et
-- bræt fyldt med hver toerpotens fra 2^17 ned til 2^2 har derfor kostet
-- summen af (n - 1) · 2^n for n = 2..17, som er 3.932.164 point. Det tal
-- rundes op til 4.000.000: ingen kommer i nærheden af det, men vrøvl som
-- 9.999.999 stopper stadig i døren.
alter table public.game_scores
  drop constraint if exists game_scores_game_known;
alter table public.game_scores
  add constraint game_scores_game_known
    check (game in ('tetris', 'kaper', '2048'));

alter table public.game_scores
  drop constraint if exists game_scores_score_plausible;
alter table public.game_scores
  add constraint game_scores_score_plausible check (
    case game
      when 'tetris' then score <= 5000 + lines * (1000 + lines * 60)
      when 'kaper' then score <= 500 * (lines + 1)
      when '2048' then score <= 4000000
      else false
    end
  );

-- Tabellens grants blev skrevet eksplicit i 20260911120000_explicit_api_grants.sql
-- og gælder uændret: en udvidet check-constraint rører ikke rettighederne.

-- Fortæl medlemmerne, at spillet findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-2048',
  'Nyt spil: 2048',
  'Skub brikkerne sammen, så to ens bliver til én -- og se, om du kan nå 2048. Stryg over brættet på telefonen eller brug piletasterne. Dit bedste resultat lander på klubbens liste. Find det under Spil.',
  'spil/2048'
)
on conflict (slug) do nothing;
