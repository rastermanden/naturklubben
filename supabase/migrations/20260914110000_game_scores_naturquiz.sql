-- Spil nummer fire: Naturquiz (#221).
--
-- `game_scores` bærer flere spil (se 20260906090000_game_scores.sql,
-- 20260910090000_game_scores_kaper.sql og 20260913090000_game_scores_2048.sql):
-- `game` udvides her, og rimelighedsgrænsen på pointene får en gren for
-- naturquiz. `lines` bruges til antallet af rigtige svar i runden (0-10);
-- `level` betyder ikke noget for naturquiz og bliver stående på sin
-- standardværdi (1).
--
-- Grænsen er regnet ud fra spillets egne regler (se
-- `src/features/games/naturquiz/engine.ts`): en runde er ti spørgsmål, et
-- rigtigt svar giver 100 grundpoint, op til 50 i hastighedsbonus for et
-- prompte svar, og en streakbonus på 10 point pr. rigtigt svar i træk før
-- dette (så 0, 10, 20 ... op til 90 for de ti spørgsmål). Den højeste
-- pointsum for `lines` rigtige svar fås ved at svare rigtigt på dem alle i
-- træk med fuld hastighedsbonus hver gang:
--
--   maksimum(lines) = lines * (100 + 50) + 10 * (0 + 1 + ... + (lines - 1))
--                   = 150 * lines + 5 * lines * (lines - 1)
--
-- For ti rigtige er det 150*10 + 5*10*9 = 1950 point. Formlen er skrevet med
-- `lines`, ikke et fast tal, så den også afviser vrøvl som "800 point og 2
-- rigtige svar" -- akkurat som Tetris' og Kaptajn Kapers grænser.
alter table public.game_scores
  drop constraint if exists game_scores_game_known;
alter table public.game_scores
  add constraint game_scores_game_known
    check (game in ('tetris', 'kaper', '2048', 'naturquiz'));

alter table public.game_scores
  drop constraint if exists game_scores_score_plausible;
alter table public.game_scores
  add constraint game_scores_score_plausible check (
    case game
      when 'tetris' then score <= 5000 + lines * (1000 + lines * 60)
      when 'kaper' then score <= 500 * (lines + 1)
      when '2048' then score <= 4000000
      when 'naturquiz' then score <= 150 * lines + 5 * lines * (lines - 1)
      else false
    end
  );

-- Tabellens grants blev skrevet eksplicit i 20260911120000_explicit_api_grants.sql
-- og gælder uændret: en udvidet check-constraint rører ikke rettighederne.

-- Fortæl medlemmerne, at spillet findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-naturquiz',
  'Nyt spil: Naturquiz',
  'Genkend fuglen, planten eller sporet på billedet blandt fire muligheder. Ti spørgsmål pr. runde, point for at svare rigtigt og hurtigt, og en voksende bonus, hvis du rammer rigtigt flere gange i træk. Dit resultat lander på klubbens liste under Spil.',
  'spil/naturquiz'
)
on conflict (slug) do nothing;
