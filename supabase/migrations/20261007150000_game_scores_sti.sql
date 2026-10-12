-- Spil nummer fem: Stifinderen.
--
-- `game_scores` bærer flere spil (se 20260906090000_game_scores.sql og de
-- senere udvidelser). `game` udvides her, og rimelighedsgrænsen får en gren
-- for `sti`.
--
-- `lines` er antal poster, `level` er baneklassen. En klaret bane har altid
-- netop det antal poster, klassen lover, og pointene kan ikke overstige
-- klassens loft -- det tal, en hurtigste rute giver. Loftet står i
-- `CLASS_MAX_SCORE` i `src/features/games/sti/engine.ts`:
--
--   let (level 1, 5 poster)         1.200
--   mellemsvær (level 2, 8 poster)  3.600
--   svær (level 3, 12 poster)       6.000
--
-- En anden kombination af bane og poster er ikke et parti, spillet kan
-- slutte, og afvises derfor.
alter table public.game_scores
  drop constraint if exists game_scores_game_known;
alter table public.game_scores
  add constraint game_scores_game_known
    check (game in ('tetris', 'kaper', '2048', 'naturquiz', 'sti'));

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
      else false
    end
  );

-- Tabellens grants blev skrevet eksplicit i 20260911120000_explicit_api_grants.sql
-- og gælder uændret: en udvidet check-constraint rører ikke rettighederne.

-- Fortæl medlemmerne, at spillet findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-stifinderen',
  'Nyt spil: Stifinderen',
  'Vælg en let, mellemsvær eller svær bane, og gå posterne i rækkefølge. Sti er hurtig, mose er langsom, og vand må du gå udenom. Jo tættere du kommer på den hurtigste rute, jo flere point. Den svære bane kan toppe listen. Find det under Spil.',
  'spil/sti'
)
on conflict (slug) do nothing;
