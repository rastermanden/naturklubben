-- Naturquiz på resultatlisten: spillet er kendt, og rimelighedsgrænsen på
-- pointene har sin egen gren for det, tied til antallet af rigtige svar
-- (`lines`) -- akkurat som Tetris og Kaptajn Kaper, og til forskel fra 2048's
-- faste loft.
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

-- Et helt almindeligt parti: ti rigtige svar, som klienten sender det.
select lives_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('naturquiz', '00000000-0000-0000-0000-00000000000a', 1950, 10)$$,
  'det højeste opnåelige resultat for ti rigtige svar accepteres'
);

-- Ét point over grænsen for samme antal rigtige svar afvises.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('naturquiz', '00000000-0000-0000-0000-00000000000a', 1951, 10)$$,
  '23514',
  null,
  'et point-tal ud over det teoretiske maksimum for ti rigtige afvises'
);

-- Grænsen følger `lines`, ikke et fast tal: 800 point kræver flere rigtige
-- svar end to.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('naturquiz', '00000000-0000-0000-0000-00000000000a', 800, 2)$$,
  '23514',
  null,
  'et højt point-tal med få rigtige svar afvises'
);

-- Ingen rigtige svar kan ikke give point.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('naturquiz', '00000000-0000-0000-0000-00000000000a', 1, 0)$$,
  '23514',
  null,
  'point uden et eneste rigtigt svar afvises'
);

select lives_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('naturquiz', '00000000-0000-0000-0000-00000000000a', 0, 0)$$,
  'nul point uden rigtige svar accepteres'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score)
    values ('quizspil', '00000000-0000-0000-0000-00000000000a', 10)$$,
  '23514',
  null,
  'et spil, databasen ikke kender, afvises stadig'
);

select is(
  (select count(*)::int from public.game_scores where game = 'naturquiz'),
  2,
  'de gyldige resultater står på listen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
