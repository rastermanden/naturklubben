-- Spil nummer to: Kaptajn Kaper i Kattegat.
--
-- `game_scores` blev skrevet til at bære flere spil end Tetris (se
-- 20260906090000_game_scores.sql): `game` er en tekstkolonne med en
-- check-constraint, som udvides her. Kolonnerne genbruges med hver sin
-- betydning -- `lines` er ryddede rækker i Tetris og antal træk i Kaptajn
-- Kaper, og `level` er dér en rang fra 1 (matros) til 5 (admiral).
--
-- Rimelighedsgrænsen på pointene skal derfor også kende spillet. I Kaptajn
-- Kaper giver et træk højst ét slag (op til 300 point for det største skib,
-- når det både overgiver sig og sænkes) plus udbetalingen af prisepenge i
-- København (op til 150 point pr. tidligere taget prise). 500 point pr. træk
-- er derfor et loft, ingen ærlig kaptajn rammer.
alter table public.game_scores
  drop constraint if exists game_scores_game_known;
alter table public.game_scores
  add constraint game_scores_game_known check (game in ('tetris', 'kaper'));

alter table public.game_scores
  drop constraint if exists game_scores_score_plausible;
alter table public.game_scores
  add constraint game_scores_score_plausible check (
    case game
      when 'tetris' then score <= 5000 + lines * (1000 + lines * 60)
      when 'kaper' then score <= 500 * (lines + 1)
      else false
    end
  );

-- Fortæl medlemmerne, at spillet findes (se CLAUDE.md, "Nye funktioner meldes
-- til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'spil-kaptajn-kaper',
  'Nyt spil: Kaptajn Kaper i Kattegat',
  'Kongen har givet dig kaperbrev. Jag de engelske skibe i Kattegat, skyd dem mør eller entr dem, sejl priserne til København -- og bliv adlet, før rivalen får komtessen. Et hjemmecomputerspil fra 1980''erne, genskabt til telefonen. Find det under Spil.',
  'spil/kaper'
)
on conflict (slug) do nothing;
