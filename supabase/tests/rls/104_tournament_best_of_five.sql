-- Finalen spilles bedst af fem (20260913170000): record_tournament_match_result
-- skal måle hver kamp efter dens egen `best_of`, og tournament_games skal have
-- plads til fem spil.
begin;

set local search_path = public, tests;

select plan(10);

do $$
begin
  perform tests.create_member(
    'bestof@example.com', false, '00000000-0000-0000-0000-0000000000fb'
  );
end
$$;

do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000fb'); end $$;

-- En semifinale (bedst af tre) og en finale (bedst af fem).
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
          'id', '00000000-0000-0000-0000-0000000000c1',
          'round', 1, 'match_index', 0,
          'participant1_id', '00000000-0000-0000-0000-00000000000a',
          'participant2_id', '00000000-0000-0000-0000-00000000000b',
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null,
          'bye', false, 'best_of', 3
        ),
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000c2',
          'round', 2, 'match_index', 0,
          'participant1_id', '00000000-0000-0000-0000-00000000000a',
          'participant2_id', '00000000-0000-0000-0000-00000000000b',
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null,
          'bye', false, 'best_of', 5
        )
      )
    )$$,
  'en bracket med en finale bedst af fem kan oprettes'
);

select is(
  (select best_of from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  5::smallint,
  'finalen står som bedst af fem'
);

select is(
  (select best_of from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c1'),
  3::smallint,
  'en manglende best_of i JSON''en falder tilbage til tre'
);

-- === bedst af fem afgøres ikke af to spilsejre =============================

select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000c2',
      array[
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a'
      ]::uuid[]
    )$$,
  '22023',
  'Kampen kan ikke afgøres uden en vinder af 3 spil',
  'to spilsejre afgør ikke en finale bedst af fem'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  'pending',
  'finalen står stadig som ikke afgjort'
);

-- === tre spilsejre afgør den, også over fem spil ===========================

select lives_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000c2',
      array[
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a'
      ]::uuid[]
    )$$,
  'en finale kan afgøres over alle fem spil'
);

select is(
  (select winner_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000c2'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'vinderen er den, der først nåede 3 spilsejre'
);

select is(
  (select count(*)::int from public.tournament_games
    where match_id = '00000000-0000-0000-0000-0000000000c2'),
  5,
  'alle fem spil blev gemt -- game_number 4 og 5 er ikke længere afvist'
);

-- === en kamp bedst af tre må stadig kun gå over tre spil ===================

select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000c1',
      array[
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a'
      ]::uuid[]
    )$$,
  '22023',
  'En kamp er højst 3 spil',
  'fem spil kan ikke tastes ind på en kamp bedst af tre'
);

select is(
  (select count(*)::int from public.tournament_games
    where match_id = '00000000-0000-0000-0000-0000000000c1'),
  0,
  'den afviste indtastning lagde ingen spil ind'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
