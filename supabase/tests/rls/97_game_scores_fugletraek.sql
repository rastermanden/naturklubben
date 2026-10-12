-- Fugletræk på resultatlisten: spillet er kendt, og rimelighedsgrænsen kender
-- bræt-klassen. Et perfekt parti rammer færrest mulige vendinger (antallet af
-- par), og pointene kan ikke overstige klassens loft. En vendings-tælling
-- under antallet af par er ikke et parti.
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
    values ('fugletraek', '00000000-0000-0000-0000-00000000000a', 6000, 10, 3, 20)$$,
  'et perfekt svært bræt kan lægges på listen'
);

select lives_ok(
  $$insert into public.game_scores
      (game, player_id, score, lines, level, duration_seconds)
    values ('fugletraek', '00000000-0000-0000-0000-00000000000a', 1200, 6, 1, 15)$$,
  'et perfekt let bræt lige på loftet accepteres'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('fugletraek', '00000000-0000-0000-0000-00000000000a', 6001, 10, 3)$$,
  '23514',
  null,
  'et point over det svære brætts loft afvises'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('fugletraek', '00000000-0000-0000-0000-00000000000a', 100, 5, 1)$$,
  '23514',
  null,
  'færre vendinger end par er ikke et parti og afvises'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('fugletraek', '00000000-0000-0000-0000-00000000000a', 100, 5, 2)$$,
  '23514',
  null,
  'en mellemsvær med færre vendinger end par afvises'
);

-- Stifinderens grænse er uændret: en svær bane med den lettes posttal afvises.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('sti', '00000000-0000-0000-0000-00000000000a', 100, 5, 3)$$,
  '23514',
  null,
  'Stifinderens egen grænse gælder stadig'
);

select is(
  (select count(*)::int from public.game_scores where game = 'fugletraek'),
  2,
  'de to gyldige brætter står på listen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
