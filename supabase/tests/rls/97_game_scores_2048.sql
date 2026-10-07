-- 2048 på resultatlisten: spillet er kendt, og rimelighedsgrænsen på pointene
-- har sin egen gren for det -- et ukendt spil afvises stadig, og et point-tal
-- ud over 4×4-brættets teoretiske maksimum kommer ikke ind.
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

-- Et helt almindeligt parti, som klienten sender det: kun point og tid.
select lives_ok(
  $$insert into public.game_scores (game, player_id, score, duration_seconds)
    values ('2048', '00000000-0000-0000-0000-00000000000a', 20512, 720)$$,
  'et resultat fra 2048 kan lægges på listen'
);

-- `lines` og `level` bliver stående på deres standardværdier.
select lives_ok(
  $$insert into public.game_scores (game, player_id, score)
    values ('2048', '00000000-0000-0000-0000-00000000000a', 1234)$$,
  'et 2048-resultat uden træk og brikstørrelse accepteres også'
);

-- Grænsen er 4.000.000 uanset antallet af træk.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('2048', '00000000-0000-0000-0000-00000000000a', 4000001, 5000, 17)$$,
  '23514',
  null,
  'et point-tal ud over brættets teoretiske maksimum afvises'
);

select lives_ok(
  $$insert into public.game_scores (game, player_id, score, lines, level)
    values ('2048', '00000000-0000-0000-0000-00000000000a', 4000000, 5000, 17)$$,
  'et point-tal lige på grænsen accepteres'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score)
    values ('4096', '00000000-0000-0000-0000-00000000000a', 10)$$,
  '23514',
  null,
  'et spil, databasen ikke kender, afvises stadig'
);

select is(
  (select count(*)::int from public.game_scores where game = '2048'),
  3,
  'de gyldige resultater står på listen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
