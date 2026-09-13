-- #229-opfølgning: create_tournament_with_matches, record_tournament_match_result
-- og undo_tournament_match_result skal opføre sig atomisk og holde sig inden
-- for de samme RLS-regler som før (kun autentificerede, og kun deres egen
-- turnering ved oprettelse). Trigger-funktionen skal afvise et enkeltspils-
-- resultat, der peger på en deltager uden for kampen.
begin;

set local search_path = public, tests;

select plan(15);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'carol@example.com', false, '00000000-0000-0000-0000-00000000000c'
  );
end
$$;

-- === create_tournament_with_matches ========================================

do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select public.create_tournament_with_matches(
      'round_robin', '[]'::jsonb, '[]'::jsonb
    )$$,
  '42501',
  null,
  'anonyme kan ikke oprette en turnering via RPC''en'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$select public.create_tournament_with_matches(
      'round_robin',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000d1',
          'user_id', '00000000-0000-0000-0000-00000000000a',
          'display_name', 'alice', 'seed', 1
        ),
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000d2',
          'user_id', '00000000-0000-0000-0000-00000000000b',
          'display_name', 'bob', 'seed', 2
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000e1',
          'round', 1, 'match_index', 0,
          'participant1_id', '00000000-0000-0000-0000-0000000000d1',
          'participant2_id', '00000000-0000-0000-0000-0000000000d2',
          'winner_id', null, 'status', 'pending',
          'next_match_id', null, 'next_match_slot', null
        )
      )
    )$$,
  'et medlem kan oprette en turnering med deltagere og kampe i ét kald'
);

select is(
  (select created_by from public.tournaments
    order by created_at desc limit 1),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'created_by er altid den kaldende bruger, uanset hvad klienten sender'
);

select is(
  (select count(*)::int from public.tournament_participants
    where tournament_id =
      (select id from public.tournaments order by created_at desc limit 1)),
  2,
  'begge deltagere blev indsat'
);

select is(
  (select count(*)::int from public.tournament_matches
    where tournament_id =
      (select id from public.tournaments order by created_at desc limit 1)),
  1,
  'kampen blev indsat'
);

-- === trigger: enkeltspil skal handle om kampens egne deltagere =============

select throws_ok(
  $$insert into public.tournament_games (match_id, game_number, winner_id)
    values (
      '00000000-0000-0000-0000-0000000000e1', 1,
      '00000000-0000-0000-0000-00000000000c'
    )$$,
  '23514',
  null,
  'et enkeltspil kan ikke tildeles en vinder uden for kampen'
);

-- === record_tournament_match_result ========================================

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select lives_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000e1',
      array[
        '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000d1'
      ]::uuid[]
    )$$,
  'et andet medlem kan indtaste et resultat via RPC''en'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'completed',
  'kampen står som afgjort'
);

select is(
  (select winner_id from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  'vinderen er den, der først fik 2 sejre'
);

select is(
  (select status from public.tournaments
    where id = (select tournament_id from public.tournament_matches
      where id = '00000000-0000-0000-0000-0000000000e1')),
  'completed',
  'turneringen markeres afsluttet, når alle-mod-alle er spillet færdigt'
);

select throws_ok(
  $$select public.record_tournament_match_result(
      '00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-0000000000d1']::uuid[]
    )$$,
  '22023',
  'Kampen kan ikke afgøres uden en vinder af 2 spil',
  'kan ikke afgøre en kamp med kun 1 spil'
);

-- === undo_tournament_match_result ==========================================

select lives_ok(
  $$select public.undo_tournament_match_result(
      '00000000-0000-0000-0000-0000000000e1'
    )$$,
  'resultatet kan fortrydes'
);

select is(
  (select status from public.tournament_matches
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'pending',
  'kampen er tilbage som ikke afgjort'
);

select is(
  (select count(*)::int from public.tournament_games
    where match_id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'enkeltspillene er slettet'
);

select is(
  (select status from public.tournaments
    where id = (select tournament_id from public.tournament_matches
      where id = '00000000-0000-0000-0000-0000000000e1')),
  'in_progress',
  'turneringen er ikke længere afsluttet'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
