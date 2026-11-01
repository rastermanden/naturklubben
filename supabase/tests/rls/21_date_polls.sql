-- Datoafstemninger for admins (#288): kun admins kan se og oprette dem, hver
-- admin kan kun skrive sit eget svar, der kan ikke svares i en lukket
-- afstemning, og almindelige medlemmer og anonyme ser intet og kan intet.
-- Hele filen kører i én transaktion, der rulles tilbage.
begin;

set local search_path = public, tests;

select plan(32);

do $$
begin
  perform tests.create_member(
    'alice-admin@example.com', true, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob-admin@example.com', true, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'carol@example.com', false, '00000000-0000-0000-0000-00000000000c'
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Anonyme og almindelige medlemmer
-- ---------------------------------------------------------------------------
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select public.create_date_poll('Tur', null,
      '[{"starts_at": "2026-12-05T10:00:00Z"}, {"starts_at": "2026-12-06T10:00:00Z"}]')$$,
  '42501',
  null,
  'en anonym kan ikke oprette en datoafstemning'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select throws_ok(
  $$select public.create_date_poll('Tur', null,
      '[{"starts_at": "2026-12-05T10:00:00Z"}, {"starts_at": "2026-12-06T10:00:00Z"}]')$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke oprette en datoafstemning'
);

-- ---------------------------------------------------------------------------
-- Alice (admin) opretter en afstemning
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$select public.create_date_poll('Tur', null,
      '[{"starts_at": "2026-12-05T10:00:00Z"}]')$$,
  '22023',
  null,
  'en afstemning med kun én dato afvises'
);

select throws_ok(
  $$select public.create_date_poll('Tur', null, (
      select jsonb_agg(jsonb_build_object(
        'starts_at', ('2026-12-01T10:00:00Z'::timestamptz + make_interval(days => d))
      ))
      from generate_series(1, 11) as d
    ))$$,
  '22023',
  null,
  'en afstemning med elleve datoer afvises'
);

select throws_ok(
  $$select public.create_date_poll('   ', null,
      '[{"starts_at": "2026-12-05T10:00:00Z"}, {"starts_at": "2026-12-06T10:00:00Z"}]')$$,
  '22023',
  null,
  'et tomt navn afvises'
);

select throws_ok(
  $$select public.create_date_poll('Tur', null,
      '[{"starts_at": "2026-12-05T10:00:00Z"}, {"starts_at": "2026-12-05T10:00:00Z"}]')$$,
  '22023',
  null,
  'den samme dato to gange afvises'
);

select throws_ok(
  $$select public.create_date_poll('Tur', null,
      '[{"starts_at": "2026-12-05T10:00:00Z", "ends_at": "2026-12-05T09:00:00Z"},
        {"starts_at": "2026-12-06T10:00:00Z"}]')$$,
  '22023',
  null,
  'en dato, der slutter før den starter, afvises'
);

select throws_ok(
  $$select public.create_date_poll('Tur', null,
      '[{"starts_at": "ikke en dato"}, {"starts_at": "2026-12-06T10:00:00Z"}]')$$,
  '22023',
  null,
  'en ugyldig dato afvises'
);

create temporary table poll_ids (id uuid) on commit drop;
grant all on poll_ids to authenticated;

insert into poll_ids
select public.create_date_poll(
  '  Svampetur  ',
  'Hvornår kan I?',
  '[{"starts_at": "2026-12-05T10:00:00Z", "ends_at": "2026-12-05T14:00:00Z"},
    {"starts_at": "2026-12-06T10:00:00Z"},
    {"starts_at": "2026-12-12T10:00:00Z"}]'
);

select is(
  (select title from public.date_polls where id = (select id from poll_ids)),
  'Svampetur',
  'navnet gemmes uden mellemrum omkring'
);

select is(
  (select count(*)::int from public.date_poll_options
    where poll_id = (select id from poll_ids)),
  3,
  'alle tre datoer er gemt'
);

select results_eq(
  $$select position::int from public.date_poll_options
    where poll_id = (select id from poll_ids) order by starts_at$$,
  array[0, 1, 2],
  'datoerne har deres rækkefølge'
);

select is(
  (select created_by from public.date_polls where id = (select id from poll_ids)),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'opretteren er Alice'
);

-- Alice svarer
select lives_ok(
  $$select public.set_date_poll_vote(
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 0),
      'yes')$$,
  'en admin kan svare på en dato'
);

select lives_ok(
  $$select public.set_date_poll_vote(
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 0),
      'maybe')$$,
  'en admin kan skifte sit svar'
);

select is(
  (select answer from public.date_poll_votes
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and option_id = (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 0)),
  'maybe',
  'det nye svar har erstattet det gamle'
);

select is(
  (select count(*)::int from public.date_poll_votes
    where user_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'der er kun ét svar pr. admin pr. dato'
);

select throws_ok(
  $$select public.set_date_poll_vote(
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 1),
      'kan-ikke')$$,
  '22023',
  null,
  'et ukendt svar afvises'
);

select lives_ok(
  $$select public.set_date_poll_vote(
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 1),
      'no')$$,
  'Alice kan ikke den 6.'
);

-- Svar kan ikke skrives udenom RPC'en
select throws_ok(
  $$insert into public.date_poll_votes (option_id, user_id, answer)
    values (
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 2),
      '00000000-0000-0000-0000-00000000000b',
      'yes')$$,
  '42501',
  null,
  'en admin kan ikke skrive et svar direkte i tabellen -- slet ikke for en anden'
);

-- ---------------------------------------------------------------------------
-- Bob (admin) svarer for sig selv
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (select count(*)::int from public.date_polls),
  1,
  'en anden admin kan se afstemningen'
);

select lives_ok(
  $$select public.set_date_poll_vote(
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 0),
      'yes')$$,
  'Bob kan svare'
);

select is(
  (select answer from public.date_poll_votes
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and option_id = (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 0)),
  'maybe',
  'Bobs svar har ikke rørt Alices'
);

select is(
  (select count(*)::int from public.date_poll_votes),
  3,
  'Bob kan se alle svar, også Alices'
);

-- ---------------------------------------------------------------------------
-- Carol (almindeligt medlem) ser intet og kan intet
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select is(
  (select count(*)::int from public.date_polls)
    + (select count(*)::int from public.date_poll_options)
    + (select count(*)::int from public.date_poll_votes),
  0,
  'et almindeligt medlem ser hverken afstemninger, datoer eller svar'
);

select throws_ok(
  $$select public.set_date_poll_vote(
      (select id from poll_ids)::uuid, 'yes')$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke svare'
);

select throws_ok(
  $$select public.delete_date_poll((select id from poll_ids))$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke slette en afstemning'
);

-- ---------------------------------------------------------------------------
-- Bob lukker afstemningen med den 5.
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select throws_ok(
  $$select public.close_date_poll(
      (select id from poll_ids), gen_random_uuid())$$,
  '22023',
  null,
  'en dato fra en anden (eller ingen) afstemning kan ikke vælges'
);

select lives_ok(
  $$select public.close_date_poll(
      (select id from poll_ids),
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 0))$$,
  'en admin kan vælge en dato og lukke afstemningen'
);

select throws_ok(
  $$select public.set_date_poll_vote(
      (select id from public.date_poll_options
        where poll_id = (select id from poll_ids) and position = 2),
      'yes')$$,
  '22023',
  null,
  'der kan ikke svares i en lukket afstemning'
);

-- Begivenheden oprettes og knyttes til afstemningen
do $$
begin
  insert into public.events (id, title, start_at, created_by)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    'Svampetur',
    '2026-12-05T10:00:00Z',
    '00000000-0000-0000-0000-00000000000b'
  );
end
$$;

select lives_ok(
  $$select public.set_date_poll_event(
      (select id from poll_ids), '00000000-0000-0000-0000-0000000000e1')$$,
  'begivenheden kan knyttes til den lukkede afstemning'
);

select is(
  (select event_id from public.date_polls where id = (select id from poll_ids)),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'afstemningen husker begivenheden'
);

select lives_ok(
  $$select public.delete_date_poll((select id from poll_ids))$$,
  'en admin kan slette afstemningen'
);

select * from finish();
rollback;
