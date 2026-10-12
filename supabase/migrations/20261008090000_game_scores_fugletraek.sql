-- Spil nummer seks: Fugletræk.
--
-- `game_scores` bærer flere spil (se 20260906090000_game_scores.sql og de
-- senere udvidelser, senest 20261007150000_game_scores_sti.sql). `game`
-- udvides her, og rimelighedsgrænsen får en gren for `fugletraek`.
--
-- `lines` er antal vendinger (en vending = et par kort vendt), `level` er
-- bræt-klassen. Et perfekt parti rammer færrest mulige vendinger -- antallet
-- af par -- så `lines >= par` skal gælde, og pointene kan ikke overstige
-- klassens loft. Tallene står i `CLASS_PAIRS`/`CLASS_MAX_SCORE` i
-- `src/features/games/fugletraek/engine.ts`:
--
--   let (level 1, 6 par, 12 kort)         1.200
--   mellemsvær (level 2, 8 par, 16 kort)  3.600
--   svær (level 3, 10 par, 20 kort)       6.000
--
-- En anden kombination af klasse og vendinger er ikke et parti, spillet kan
-- slutte, og afvises derfor (fx færre vendinger end par, eller en forkert
-- klasse).
alter table public.game_scores
  drop constraint if exists game_scores_game_known;
alter table public.game_scores
  add constraint game_scores_game_known
    check (game in ('tetris', 'kaper', '2048', 'naturquiz', 'sti', 'fugletraek'));

alter table public.game_scores
  drop constraint if exists game_scores_score_plausible;
alter table public.game_scores
  add constraint game_scores_score_plausible check (
    case game
      when 'tetris' then score <= 5000 + lines * (1000 + lines * 60)
      when 'kaper' then score <= 500 * (lines + 1)
      when '2048' then score <= 4000000
      when 'naturquiz' then score <= 150 * lines + 5 * lines * (lines - 1)
      when 'sti' then
        case
          when level = 1 and lines = 5 then score <= 1200
          when level = 2 and lines = 8 then score <= 3600
          when level = 3 and lines = 12 then score <= 6000
          else false
        end
      when 'fugletraek' then
        case
          when level = 1 and lines >= 6 then score <= 1200
          when level = 2 and lines >= 8 then score <= 3600
          when level = 3 and lines >= 10 then score <= 6000
          else false
        end
      else false
    end
  );

-- Tabellens grants blev skrevet eksplicit i 20260911120000_explicit_api_grants.sql
-- og gælder uændret: en udvidet check-constraint rører ikke rettighederne.

-- Fortæl medlemmerne, at spillet findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-fugletraek',
  'Nyt spil: Fugletræk',
  'Vend kortene to ad gangen og find parrene af danske dyr. To ens bliver liggende, to forskellige vendes tilbage. Vælg et let, mellemsvært eller svært bræt. Jo færre vendinger og jo hurtigere, jo flere point. Find det under Spil.',
  'spil/fugletraek'
)
on conflict (slug) do nothing;
