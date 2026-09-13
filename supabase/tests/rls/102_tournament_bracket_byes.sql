-- #196-opfølgning (spredte byes, se 20260913140000_tournament_bracket_byes.sql):
-- en bye i en senere runde end runde 1 kan ikke afgøres ved oprettelsen --
-- den skal afgøres automatisk af record_tournament_match_result, så snart
-- dens ene mulige plads bliver udfyldt, og evt. rykkes videre gennem flere
-- byes i træk. undo_tournament_match_result skal kunne rulle samme kæde
-- tilbage igen.
begin;

set local search_path = public, tests;

select plan(18);

do $$
begin
  perform tests.create_member(
    'byes-alice@example.com', false, '00000000-0000-0000-0000-00000000ba1a'
  );
end
$$;

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000ba1a'); end $$;

-- 6 deltagere -> ingen byes i runde 1 (lige antal), men runde 2 har 3
-- entrants (2 runde-1-vindere + 1 til) og dermed præcis 1 bye. Den bye
-- fødes udelukkende af runde 1's sidste kamp (a5 mod a6) og kan derfor ikke
-- afgøres, før den kamp er spillet -- den oprettes tom med bye:true.
select lives_ok(
  $$select public.create_tournament_with_matches(
      'single_elimination',
      jsonb_build_array(
        jsonb_build_object('id', '00000000-0000-0000-0000-0000000000a1',
          'user_id', null, 'display_name', 'a1', 'seed', 1),
        jsonb_build_object('id', '00000000-0000-0000-0000-0000000000a2',
          'user_id', null, 'display_name', 'a2', 'seed', 2),
        jsonb_build_object('id', '00000000-0000-0000-0000-0000000000a3',
          'user_id', null, 'display_name', 'a3', 'seed', 3),
        jsonb_build_object('id', '00000000-0000-0000-0000-0000000000a4',
          'user_id', null, 'display_name', 'a4', 'seed', 4),
        jsonb_build_object('id', '00000000-0000-0000-0000-0000000000a5',
          'user_id', null, 'display_name', 'a5', 'seed', 5),
        jsonb_build_object('id', '00000000-0000-0000-0000-0000000000a6',
          'user_id', null, 'display_name', 'a6', 'seed', 6)
      ),
      jsonb_build_array(
        -- Runde 1: tre rigtige kampe, ingen byes.
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000b1',
          'round', 1, 'match_index', 0,
          'participant1_id', '00000000-0000-0000-0000-0000000000a1',
          'participant2_id', '00000000-0000-0000-0000-0000000000a2',
          'winner_id', null, 'status', 'pending',
          'next_match_id', '00000000-0000-0000-0000-0000000000c1',
          'next_match_slot', 1, 'bye', false
        ),
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000b2',
          'round', 1, 'match_index', 1,
          'participant1_id', '00000000-0000-0000-0000-0000000000a3',
          'participant2_id', '00000000-0000-0000-0000-0000000000a4',
          'winner_id', null, 'status', 'pending',
          'next_match_id', '00000000-0000-0000-0000-0000000000c1',
          'next_match_slot', 2, 'bye', false
        ),
        -- Denne fødes runde 2's bye direkte -- ingen 'bye'-nøgle her med
        -- vilje, for også at teste at RPC'en falder tilbage til false.
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000b3',
          'round', 1, 'match_index', 2,
          'participant1_id', '00000000-0000-0000-0000-0000000000a5',
          'participant2_id', '00000000-0000-0000-0000-0000000000a6',
          'winner_id', null, 'status', 'pending',
          'next_match_id', '00000000-0000-0000-0000-0000000000c2',
          'next_match_slot', 1
        ),
        -- Runde 2: én rigtig kamp...
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000c1',
          'round', 2, 'match_index', 0,
          'participant1_id', null, 'participant2_id', null,
          'winner_id', null, 'status', 'pending',
          'next_match_id', '00000000-0000-0000-0000-0000000000d1',
          'next_match_slot', 1, 'bye', false
        ),
        -- ...og én bye, der endnu ikke kan afgøres (venter på b3).
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000c2',
          'round', 2, 'match_index', 1,
          'participant1_id', null, 'participant2_id', null,
          'winner_id', null, 'status', 'pending',
          'next_match_id', '00000000-0000-0000-0000-0000000000d1',
          'next_match_slot', 2, 'bye', true
        ),
        -- Finalen -- aldrig en bye.
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000d1',
          'round', 3, 'match_index', 0,
          'participant1_id', null, 'participant2_id', null,
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null, 'bye', false
        )
      )
    )$$,
  'en bracket med en udskudt bye i runde 2 kan oprettes'
);

select is(
  (select bye from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000b3'),
  false,
  'manglende bye-nøgle i JSON''en falder tilbage til false'
);

select is(
  (select bye from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  true,
  'runde 2''s bye er markeret, selvom den endnu ikke er afgjort'
);

-- === kaskaden: b3 afgøres -> c2 (bye) afgøres automatisk -> d1 (finalen) =

select lives_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b3',
      array[
        '00000000-0000-0000-0000-0000000000a5',
        '00000000-0000-0000-0000-0000000000a5'
      ]::uuid[]
    )$$,
  'runde 1''s sidste kamp kan afgøres'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  'completed',
  'runde 2''s bye afgøres automatisk, så snart dens ene fødekamp er spillet'
);

select is(
  (select winner_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  '00000000-0000-0000-0000-0000000000a5'::uuid,
  'byens vinder er den samme som fødekampens vinder'
);

select is(
  (select participant2_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-0000000000a5'::uuid,
  'kaskaden fortsætter: vinderen rykker videre til finalen med det samme'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000d1'),
  'pending',
  'finalen er selv ikke en bye -- den venter stadig på runde 2''s rigtige kamp'
);

select is(
  (select status from public.tournaments
    where id = (select tournament_id from public.tournament_matches
      where id = '00000000-0000-0000-0000-0000000000d1')),
  'in_progress',
  'turneringen er ikke afsluttet, så længe finalen mangler en rigtig deltager'
);

-- === en bye kan ikke fortrydes direkte ====================================

select throws_ok(
  $$select public.undo_tournament_match_result(
      '00000000-0000-0000-0000-0000000000c2'
    )$$,
  '22023',
  'En bye kan ikke fortrydes',
  'den automatisk afgjorte bye kan ikke fortrydes direkte'
);

-- === fortrydelse af b3 skal rulle hele kaskaden tilbage ====================

select lives_ok(
  $$select public.undo_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b3'
    )$$,
  'runde 1''s kamp kan fortrydes, selvom den kaskaderede videre til en bye'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  'pending',
  'runde 2''s bye er rullet tilbage til ikke afgjort'
);

select is(
  (select participant1_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  null,
  'byens plads, som fødekampens vinder fyldte, er ryddet igen'
);

select is(
  (select participant2_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000d1'),
  null,
  'kaskaden er rullet helt tilbage til finalen'
);

-- === er den kamp for enden af kæden en rigtig, afgjort kamp, blokeres =====
-- fortrydelsen der, i stedet for at rulle det rigtige resultat tilbage.

-- Genopretter kaskaden (b3 -> c2 -> d1.participant2), som blev rullet
-- tilbage ovenfor, så der igen er noget at fortryde.
select lives_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b3',
      array[
        '00000000-0000-0000-0000-0000000000a5',
        '00000000-0000-0000-0000-0000000000a5'
      ]::uuid[]
    )$$,
  'runde 1''s sidste kamp kan afgøres igen efter fortrydelsen'
);

-- Lader finalen selv få et rigtigt resultat -- ikke en kaskade-konsekvens,
-- men en kamp nogen faktisk har spillet og tastet ind.
do $$ begin perform tests.reset_session(); end $$;

update public.tournament_matches
set participant1_id = '00000000-0000-0000-0000-0000000000a1'
where id = '00000000-0000-0000-0000-0000000000d1';

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000ba1a'); end $$;

select lives_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000d1',
      array[
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a1'
      ]::uuid[]
    )$$,
  'finalen kan afgøres med et rigtigt resultat'
);

select throws_ok(
  $$select public.undo_tournament_match_result(
      '00000000-0000-0000-0000-0000000000b3'
    )$$,
  '22023',
  'Den efterfølgende kamp er allerede afgjort -- fortryd den først',
  'fortrydelsen stoppes af en rigtig, afgjort kamp for enden af bye-kæden'
);

-- === constraint: en bye må aldrig have en anden plads =====================

do $$ begin perform tests.reset_session(); end $$;

select throws_ok(
  $$insert into public.tournament_matches
      (tournament_id, round, match_index, participant1_id, participant2_id,
       status, winner_id, bye)
    values (
      (select tournament_id from public.tournament_matches
        where id = '00000000-0000-0000-0000-0000000000d1'),
      4, 0,
      '00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-0000000000a2',
      'pending', null, true
    )$$,
  '23514',
  null,
  'en bye kan ikke have to deltagere sat samtidig'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
