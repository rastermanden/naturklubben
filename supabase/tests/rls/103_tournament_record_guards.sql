-- record_tournament_match_result skal afvise kampe, der ikke kan afgøres:
-- en kamp, der allerede har et resultat, en bye (som afgøres automatisk), og
-- en kamp, hvor den ene plads stadig er tom. Se
-- 20260913160000_tournament_record_guards.sql for hvorfor -- kort fortalt
-- kunne man før "vinde" over en tom plads, og en dobbelt-indtastning fejlede
-- på en unique-nøgle med en besked, brugeren ikke kunne bruge til noget.
begin;

set local search_path = public, tests;

select plan(9);

do $$
begin
  perform tests.create_member(
    'guards@example.com', false, '00000000-0000-0000-0000-0000000000fa'
  );
end
$$;

do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000fa'); end $$;

-- En bracket med én rigtig kamp (b1), én kamp der mangler sin modstander
-- (b2) og én bye (b3).
select lives_ok(
  $$select public.create_tournament_with_matches(
      'single_elimination',
      jsonb_build_array(
        jsonb_build_object('id', '00000000-0000-0000-0000-00000000000a',
          'user_id', null, 'display_name', 'a', 'seed', 1),
        jsonb_build_object('id', '00000000-0000-0000-0000-00000000000b',
          'user_id', null, 'display_name', 'b', 'seed', 2)
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000b1',
          'round', 1, 'match_index', 0,
          'participant1_id', '00000000-0000-0000-0000-00000000000a',
          'participant2_id', '00000000-0000-0000-0000-00000000000b',
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null, 'bye', false
        ),
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000b2',
          'round', 1, 'match_index', 1,
          'participant1_id', '00000000-0000-0000-0000-00000000000a',
          'participant2_id', null,
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null, 'bye', false
        ),
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000b3',
          'round', 1, 'match_index', 2,
          'participant1_id', '00000000-0000-0000-0000-00000000000b',
          'participant2_id', null,
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null, 'bye', true
        )
      )
    )$$,
  'bracketten kan oprettes'
);

-- === en kamp, der stadig mangler en modstander ==============================

select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b2',
      array[
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a'
      ]::uuid[]
    )$$,
  '22023',
  'Kampen mangler stadig en deltager',
  'man kan ikke vinde over en tom plads'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000b2'),
  'pending',
  'kampen med den tomme plads står stadig som ikke afgjort'
);

-- === en bye ================================================================

select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b3',
      array[
        '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-00000000000b'
      ]::uuid[]
    )$$,
  '22023',
  'En bye afgøres automatisk og kan ikke tastes ind',
  'en bye kan ikke tastes ind i hånden'
);

-- === en kamp, der allerede er afgjort ======================================

select lives_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b1',
      array[
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a'
      ]::uuid[]
    )$$,
  'den rigtige kamp kan afgøres'
);

-- To arrangører taster den samme kamp ind fra hver sin telefon: den anden
-- skal have at vide, at kampen allerede er afgjort -- ikke en rå
-- unique-nøglefejl, der beder dem prøve igen i det uendelige.
select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b1',
      array[
        '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-00000000000b'
      ]::uuid[]
    )$$,
  '22023',
  'Kampen er allerede afgjort',
  'den samme kamp kan ikke tastes ind to gange'
);

select is(
  (select winner_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000b1'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'det først indtastede resultat står uændret'
);

select is(
  (select count(*)::int from public.tournament_games
    where match_id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'den anden indtastning lagde ingen ekstra enkeltspil ind'
);

-- === argumentet tjekkes stadig først =======================================
-- En kamp uden en vinder af 2 spil afvises på sit eget grundlag, også selvom
-- kampen i forvejen er afgjort -- beskeden skal pege på det, der er galt med
-- det, brugeren sendte.

select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b1',
      array['00000000-0000-0000-0000-00000000000a']::uuid[]
    )$$,
  '22023',
  'Kampen kan ikke afgøres uden en vinder af 2 spil',
  'et ugyldigt resultat afvises på sit eget grundlag'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
