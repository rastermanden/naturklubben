-- 7-kabale på resultatlisten: spillet er kendt, og rimelighedsgrænsen kender
-- træk-1 og træk-3. Point over 2.000, en anden sværhedsgrad eller et parti
-- uden træk er ikke et resultat, spillet kan gemme.
begin;

set local search_path = public, tests;

select plan(6);

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
    values ('kabale', '00000000-0000-0000-0000-00000000000a', 2000, 80, 1, 240)$$,
  'et vundet parti med træk 1 lige på loftet kan lægges på listen'
);

select lives_ok(
  $$insert into public.game_scores
      (game, player_id, score, lines, level, duration_seconds)
    values ('kabale', '00000000-0000-0000-0000-00000000000a', 2000, 120, 3, 400)$$,
  'et vundet parti med træk 3 lige på loftet accepteres'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('kabale', '00000000-0000-0000-0000-00000000000a', 2001, 80, 1)$$,
  '23514',
  null,
  'et point over loftet afvises'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('kabale', '00000000-0000-0000-0000-00000000000a', 100, 80, 2)$$,
  '23514',
  null,
  'en anden sværhedsgrad end træk 1 og træk 3 afvises'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('kabale', '00000000-0000-0000-0000-00000000000a', 100, 0, 1)$$,
  '23514',
  null,
  'et parti uden træk er ikke vundet og afvises'
);

select is(
  (select count(*)::int from public.game_scores where game = 'kabale'),
  2,
  'de to gyldige partier står på listen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
