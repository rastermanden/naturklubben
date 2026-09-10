-- Kaptajn Kaper på resultatlisten: spillet er kendt, og rimelighedsgrænsen på
-- pointene kender spillet -- Tetris' grænse gælder stadig for Tetris, og
-- Kaptajn Kapers egen for Kaptajn Kaper.
begin;

set local search_path = public, tests;

select plan(5);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select lives_ok(
  $$insert into public.game_scores
      (game, player_id, score, lines, level, duration_seconds)
    values ('kaper', '00000000-0000-0000-0000-00000000000a', 1240, 118, 2, 900)$$,
  'et resultat fra Kaptajn Kaper kan lægges på listen'
);

-- Hvert træk kan højst give 500 point; 120 træk kan derfor ikke give 100.000.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('kaper', '00000000-0000-0000-0000-00000000000a', 100000, 120, 3)$$,
  '23514',
  null,
  'et point-tal, der er umuligt for antallet af træk, afvises'
);

-- Lige på grænsen: 500 · (lines + 1).
select lives_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('kaper', '00000000-0000-0000-0000-00000000000a', 5500, 10, 1)$$,
  'et point-tal lige på grænsen accepteres'
);

-- Tetris' grænse er uændret: 10 rækker giver højst 5000 + 10 · 1600.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('tetris', '00000000-0000-0000-0000-00000000000a', 30000, 10)$$,
  '23514',
  null,
  'Tetris'' egen grænse gælder stadig'
);

select is(
  (select count(*)::int from public.game_scores where game = 'kaper'),
  2,
  'begge gyldige resultater står på listen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
