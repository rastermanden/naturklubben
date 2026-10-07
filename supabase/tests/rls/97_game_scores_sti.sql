-- Stifinderen på resultatlisten: spillet er kendt, og rimelighedsgrænsen
-- kender baneklassen. En let bane med fem poster kan ikke give mere end
-- 1.200, og en svær bane med de lettes posttal er slet ikke et parti.
begin;

set local search_path = public, tests;

select plan(7);

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
    values ('sti', '00000000-0000-0000-0000-00000000000a', 6000, 12, 3, 400)$$,
  'den hurtigste svære bane kan lægges på listen'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('sti', '00000000-0000-0000-0000-00000000000a', 6001, 12, 3)$$,
  '23514',
  null,
  'et point over den svære banes loft afvises'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('sti', '00000000-0000-0000-0000-00000000000a', 100, 5, 3)$$,
  '23514',
  null,
  'en svær bane med den lettes posttal afvises'
);

select lives_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('sti', '00000000-0000-0000-0000-00000000000a', 1200, 5, 1)$$,
  'et point-tal lige på den lettes loft accepteres'
);

select lives_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('sti', '00000000-0000-0000-0000-00000000000a', 3600, 8, 2)$$,
  'et point-tal lige på den mellemsværes loft accepteres'
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
  (select count(*)::int from public.game_scores where game = 'sti'),
  3,
  'de tre gyldige baner står på listen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
