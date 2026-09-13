-- #229: turneringer er et fælles værktøj til én turneringsdag. Alle
-- autentificerede medlemmer må læse og redigere deltagere, kampe og
-- resultater -- kun oprettelsen af selve turneringen er bundet til
-- opretteren. Anonyme kan intet se.
begin;

set local search_path = public, tests;

select plan(9);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select throws_ok(
  $$insert into public.tournaments (id, format, created_by)
    values (
      '00000000-0000-0000-0000-0000000000c1',
      'round_robin',
      '00000000-0000-0000-0000-00000000000b'
    )$$,
  '42501',
  null,
  'et medlem kan ikke oprette en turnering i en andens navn'
);

select lives_ok(
  $$insert into public.tournaments (id, format, created_by)
    values (
      '00000000-0000-0000-0000-0000000000c1',
      'round_robin',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  'et medlem kan oprette en turnering'
);

do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select 1 from public.tournaments$$,
  'anonyme kan ikke se turneringer'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select isnt_empty(
  $$select 1 from public.tournaments
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'et andet medlem kan læse turneringen'
);

select lives_ok(
  $$insert into public.tournament_participants
      (id, tournament_id, user_id, display_name, seed)
    values
      ('00000000-0000-0000-0000-0000000000d1',
       '00000000-0000-0000-0000-0000000000c1',
       '00000000-0000-0000-0000-00000000000a', 'alice', 1),
      ('00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000c1',
       '00000000-0000-0000-0000-00000000000b', 'bob', 2)$$,
  'et andet medlem kan tilføje deltagere'
);

select lives_ok(
  $$insert into public.tournament_matches
      (id, tournament_id, match_index, participant1_id, participant2_id)
    values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-0000000000c1',
      0,
      '00000000-0000-0000-0000-0000000000d1',
      '00000000-0000-0000-0000-0000000000d2'
    )$$,
  'et andet medlem kan generere en kamp'
);

select lives_ok(
  $$with recorded_game as (
      insert into public.tournament_games (match_id, game_number, winner_id)
      values (
        '00000000-0000-0000-0000-0000000000f1', 1,
        '00000000-0000-0000-0000-0000000000d1'
      )
    )
    update public.tournament_matches
    set status = 'completed', winner_id = '00000000-0000-0000-0000-0000000000d1'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'et andet medlem kan indtaste et resultat'
);

select lives_ok(
  $$delete from public.tournaments
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'et andet medlem kan slette turneringen'
);

select is_empty(
  $$select 1 from public.tournament_matches
    where tournament_id = '00000000-0000-0000-0000-0000000000c1'$$,
  'sletning af turneringen fjerner også dens kampe (cascade)'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
