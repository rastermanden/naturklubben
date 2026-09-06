-- Spil-resultater (#202): alle indloggede kan læse listen, man kan kun skrive
-- sit eget resultat, ingen kan rette et resultat bagefter, og både spilleren
-- selv og en admin kan slette det.
begin;

set local search_path = public, tests;

select plan(12);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'carol@example.com', true, '00000000-0000-0000-0000-00000000000c'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select lives_ok(
  $$insert into public.game_scores
      (id, game, player_id, score, lines, level, duration_seconds)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      'tetris',
      '00000000-0000-0000-0000-00000000000a',
      12400,
      42,
      5,
      380
    )$$,
  'et medlem kan lægge sit eget resultat på listen'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score)
    values ('tetris', '00000000-0000-0000-0000-00000000000b', 999)$$,
  '42501',
  null,
  'et medlem kan ikke lægge et resultat op i en andens navn'
);

-- Pointene tælles i browseren og kan ikke bevises herfra, men et tal, der er
-- umuligt for antallet af ryddede rækker, skal ikke kunne lande på listen.
select throws_ok(
  $$insert into public.game_scores (game, player_id, score, lines)
    values ('tetris', '00000000-0000-0000-0000-00000000000a', 999999, 0)$$,
  '23514',
  null,
  'et point-tal, der er umuligt for antallet af rækker, afvises'
);

select throws_ok(
  $$insert into public.game_scores (game, player_id, score)
    values ('skak', '00000000-0000-0000-0000-00000000000a', 10)$$,
  '23514',
  null,
  'et spil, databasen ikke kender, afvises'
);

do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select 1 from public.game_scores$$,
  'anonyme kan ikke læse resultatlisten'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (select score from public.game_scores
    where id = '00000000-0000-0000-0000-0000000000e1'),
  12400,
  'de andre medlemmer kan se resultatet -- det er hele pointen med en liste'
);

-- Ingen har update-rettigheden, heller ikke på sit eget resultat: kan man rette
-- sine point bagefter, er listen ingenting værd.
select throws_ok(
  $$update public.game_scores set score = 999999
    where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '42501',
  null,
  'et resultat kan ikke rettes bagefter'
);

-- RLS filtrerer den fremmede række stille væk frem for at raise'e -- prøv, og
-- mål bagefter at den stadig står der.
do $$
begin
  delete from public.game_scores
  where id = '00000000-0000-0000-0000-0000000000e1';
end
$$;

select is(
  (select count(*)::int from public.game_scores
    where id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'et andet medlem kan ikke slette et resultat'
);

select lives_ok(
  $$insert into public.game_scores
      (id, game, player_id, score, lines, level, duration_seconds)
    values (
      '00000000-0000-0000-0000-0000000000e2',
      'tetris',
      '00000000-0000-0000-0000-00000000000b',
      3300,
      12,
      2,
      140
    )$$,
  'et andet medlem kan lægge sit eget resultat op'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$delete from public.game_scores
    where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'spilleren kan slette sit eget resultat'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select lives_ok(
  $$delete from public.game_scores
    where id = '00000000-0000-0000-0000-0000000000e2'$$,
  'en admin kan slette et andet medlems resultat'
);

-- Et resultat er personligt: slettes kontoen, følger resultaterne med.
do $$
begin
  perform tests.reset_session();
  insert into public.game_scores (game, player_id, score, lines)
  values ('tetris', '00000000-0000-0000-0000-00000000000a', 500, 4);
  delete from public.profiles
  where id = '00000000-0000-0000-0000-00000000000a';
end
$$;

select is_empty(
  $$select 1 from public.game_scores
    where player_id = '00000000-0000-0000-0000-00000000000a'$$,
  'resultaterne forsvinder sammen med kontoen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
