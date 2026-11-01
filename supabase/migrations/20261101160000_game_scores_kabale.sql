-- Spil nummer syv: 7-kabale.
--
-- `game_scores` bærer flere spil (se 20260906090000_game_scores.sql og de
-- senere udvidelser, senest 20261008090000_game_scores_fugletraek.sql). `game`
-- udvides her, og rimelighedsgrænsen får en gren for `kabale`.
--
-- `lines` er antal træk, `level` er 1 (træk ét kort) eller 3 (træk tre).
-- Kun et vundet parti gemmes. Pointene undervejs kan højst blive omkring
-- 750 (21 vendte kort à 5, 52 kort hjem à 10 og 24 kort fra talonen à 5),
-- tids-tillægget er højst 600, og træk 3 giver 400 oveni. 2.000 ligger over
-- det, spillet selv kan regne sig frem til, og under det, en tastefejl kan.
-- Tallene står i `SCORE_CAP` i `src/features/games/kabale/engine.ts`.
alter table public.game_scores
  drop constraint if exists game_scores_game_known;
alter table public.game_scores
  add constraint game_scores_game_known
    check (game in (
      'tetris', 'kaper', '2048', 'naturquiz', 'sti', 'fugletraek', 'kabale'
    ));

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
      when 'kabale' then
        level in (1, 3)
        and lines between 1 and 20000
        and score <= 2000
      else false
    end
  );

-- Tabellens grants blev skrevet eksplicit i 20260911120000_explicit_api_grants.sql
-- og gælder uændret: en udvidet check-constraint rører ikke rettighederne.

-- Fortæl medlemmerne, at spillet findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-7-kabale',
  'Nyt spil: 7-kabale',
  'Den klassiske kabale er kommet under Spil. Læg kortene i syv rækker, træk fra bunken, og byg de fire grundbunker fra es til konge. Tryk to gange på et kort for at lægge det hjem. Et vundet parti kan komme på listen.',
  'spil/kabale'
)
on conflict (slug) do nothing;
