-- Pladsloft og venteliste (#222): loftet håndhæves, en frigivet plads går til
-- præcis én -- den forreste -- på ventelisten, pladser efterladt uden om
-- RPC'en fyldes ved næste svar, og kun arrangøren og admins kan se afbud og
-- hvem der mangler at svare.
begin;

set local search_path = public, tests;

select plan(34);

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
  perform tests.create_member(
    'dave@example.com', false, '00000000-0000-0000-0000-00000000000d'
  );
  perform tests.create_member(
    'erik@example.com', false, '00000000-0000-0000-0000-00000000000e'
  );
  perform tests.create_member(
    'frida@example.com', true, '00000000-0000-0000-0000-00000000000f'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');

  -- Alice arrangerer en tur med to pladser.
  insert into public.events (id, title, start_at, created_by, max_participants)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    'Skovtur',
    now(),
    '00000000-0000-0000-0000-00000000000a',
    2
  );
end
$$;

select throws_ok(
  $$update public.events set max_participants = 0
    where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514',
  null,
  'loftet skal være mindst én plads'
);

-- Anonyme kan ikke svare
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select public.respond_to_event(
      '00000000-0000-0000-0000-0000000000e1', 'attending')$$,
  '42501',
  null,
  'anonyme kan ikke svare på en begivenhed'
);

-- Alice og Bob får de to pladser
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'attending',
  'den første tilmelding får en plads'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_locks
    where locktype = 'advisory'
      and pid = pg_catalog.pg_backend_pid()
      and objsubid = 1
      and classid = ((
        pg_catalog.hashtextextended(
          'public.event_attendance:00000000-0000-0000-0000-0000000000e1', 0
        ) >> 32) & 4294967295)::oid
      and objid = (
        pg_catalog.hashtextextended(
          'public.event_attendance:00000000-0000-0000-0000-0000000000e1', 0
        ) & 4294967295)::oid
  ),
  'svaret holder begivenhedens transaktionslås -- samtidige svar står i kø'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'attending',
  'den anden tilmelding får den sidste plads'
);

select throws_ok(
  $$insert into public.event_attendance (event_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      '00000000-0000-0000-0000-00000000000b',
      'attending'
    )$$,
  '42501',
  null,
  'tabellen kan ikke skrives uden om RPC''en -- loftet kan ikke omgås'
);

-- Carol og Dave lander på ventelisten, i den rækkefølge
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'waitlisted',
  'er der fyldt op, lander tilmeldingen på ventelisten'
);

do $$
begin
  -- Ventelisten sorteres på created_at; now() er ens i hele transaktionen,
  -- så Carols plads i køen skubbes tilbage i tid for at gøre rækkefølgen
  -- målbar.
  perform tests.reset_session();
  update public.event_attendance
  set created_at = now() - interval '1 minute'
  where user_id = '00000000-0000-0000-0000-00000000000c';
  perform tests.login('00000000-0000-0000-0000-00000000000d');
end
$$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'waitlisted',
  'den næste lander også på ventelisten'
);

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'waitlisted',
  'at melde sig igen ændrer ikke køpladsen'
);

select is(
  (select count(*)::int from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'attending'),
  2,
  'antallet af deltagere overstiger ikke loftet'
);

select results_eq(
  $$select user_id from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'waitlisted'
    order by created_at, user_id$$,
  $$values
    ('00000000-0000-0000-0000-00000000000c'::uuid),
    ('00000000-0000-0000-0000-00000000000d'::uuid)$$,
  'ventelisten står i tilmeldingsrækkefølge: Carol før Dave'
);

-- Bob melder afbud: præcis én -- Carol -- rykker op
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'none'
  ) -> 'promoted',
  '["00000000-0000-0000-0000-00000000000c"]'::jsonb,
  'et afbud rykker den forreste på ventelisten op -- og kun den'
);

select is(
  (select status from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and user_id = '00000000-0000-0000-0000-00000000000c'),
  'attending',
  'Carol har fået pladsen'
);

select is(
  (select status from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and user_id = '00000000-0000-0000-0000-00000000000d'),
  'waitlisted',
  'Dave står stadig på ventelisten'
);

-- Alice melder afbud med 'declined': Dave rykker op, og Alice tæller ikke med
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'declined'
  ),
  jsonb_build_object(
    'status', 'declined',
    'promoted', jsonb_build_array('00000000-0000-0000-0000-00000000000d')
  ),
  'et afbud fra en deltager rykker den næste op'
);

select is(
  (select count(*)::int from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'attending'),
  2,
  'pladserne er fyldt igen, ikke overfyldt'
);

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'declined'
  ) -> 'promoted',
  '[]'::jsonb,
  'et gentaget afbud rykker ingen op'
);

-- Erik kommer på ventelisten; loftet hæves, og arrangøren rykker ham op
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000e'); end $$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'waitlisted',
  'Erik lander på ventelisten'
);

select throws_ok(
  $$select public.promote_event_waitlist(
      '00000000-0000-0000-0000-0000000000e1')$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke rykke ventelisten'
);

-- Afbud er kun for den, der meldte det, arrangøren og admins. Bob melder også
-- afbud, så arrangøren har et afbud fra en anden end sig selv at se.
do $$
begin
  perform tests.login('00000000-0000-0000-0000-00000000000b');
  perform public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'declined'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000c');
end
$$;

select results_eq(
  $$select user_id, status from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
    order by user_id$$,
  $$values
    ('00000000-0000-0000-0000-00000000000c'::uuid, 'attending'),
    ('00000000-0000-0000-0000-00000000000d'::uuid, 'waitlisted'),
    ('00000000-0000-0000-0000-00000000000e'::uuid, 'waitlisted')$$,
  'et almindeligt medlem ser deltagere og venteliste, men ingen afbud'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select results_eq(
  $$select user_id from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'declined'
    order by user_id$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'den, der meldte afbud, ser sit eget -- ikke de andres'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select results_eq(
  $$select user_id from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'declined'
    order by user_id$$,
  $$values
    ('00000000-0000-0000-0000-00000000000a'::uuid),
    ('00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'arrangøren ser alle afbud'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000f'); end $$;

select results_eq(
  $$select user_id from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'declined'
    order by user_id$$,
  $$values
    ('00000000-0000-0000-0000-00000000000a'::uuid),
    ('00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'en admin ser alle afbud på en andens begivenhed'
);

do $$
begin
  -- Bob trækker afbuddet tilbage igen og mangler dermed at svare.
  perform tests.login('00000000-0000-0000-0000-00000000000b');
  perform public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'none'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  update public.events set max_participants = 3
  where id = '00000000-0000-0000-0000-0000000000e1';
end
$$;

select is(
  public.promote_event_waitlist('00000000-0000-0000-0000-0000000000e1'),
  array['00000000-0000-0000-0000-00000000000e']::uuid[],
  'et hævet loft giver arrangøren de oprykkede tilbage'
);

-- Hvem mangler at svare: Bob (trak sit svar tilbage) og Frida (aldrig svaret).
-- Alice udelades, fordi hun spørger.
select results_eq(
  $$select user_id from public.event_members_without_response(
      '00000000-0000-0000-0000-0000000000e1')$$,
  $$values
    ('00000000-0000-0000-0000-00000000000b'::uuid),
    ('00000000-0000-0000-0000-00000000000f'::uuid)$$,
  'arrangøren ser dem, der ikke har svaret -- ikke sig selv'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select throws_ok(
  $$select * from public.event_members_without_response(
      '00000000-0000-0000-0000-0000000000e1')$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke se, hvem der mangler at svare'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000f'); end $$;

select results_eq(
  $$select user_id from public.event_members_without_response(
      '00000000-0000-0000-0000-0000000000e1')$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'en admin ser listen for en andens begivenhed'
);

select throws_ok(
  $$select public.respond_to_event(
      '00000000-0000-0000-0000-0000000000e1', 'maybe')$$,
  '22023',
  null,
  'et ukendt svar afvises'
);

select throws_ok(
  $$select public.respond_to_event(
      '00000000-0000-0000-0000-0000000000e9', 'attending')$$,
  'P0002',
  null,
  'en ukendt begivenhed afvises'
);

-- En slettet konto frigiver sin plads uden om RPC'en. Pladsen går til den
-- forreste på ventelisten ved det næste svar på begivenheden -- uanset hvem
-- der svarer, og hvad de svarer.
select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ) ->> 'status',
  'waitlisted',
  'Frida lander på ventelisten, når de tre pladser er taget'
);

do $$
begin
  perform tests.reset_session();
  -- Erik sletter sin konto: rækken forsvinder med den.
  delete from public.profiles
  where id = '00000000-0000-0000-0000-00000000000e';
  perform tests.login('00000000-0000-0000-0000-00000000000b');
end
$$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'declined'
  ),
  jsonb_build_object(
    'status', 'declined',
    'promoted', jsonb_build_array('00000000-0000-0000-0000-00000000000f')
  ),
  'et afbud fra en uden plads fylder pladsen efter den slettede konto'
);

do $$
begin
  -- Bob fortryder og melder sig til: der er fyldt op, så han står i kø, indtil
  -- Dave sletter sin konto.
  perform public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  );
  perform tests.reset_session();
  delete from public.profiles
  where id = '00000000-0000-0000-0000-00000000000d';
  perform tests.login('00000000-0000-0000-0000-00000000000b');
end
$$;

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ),
  jsonb_build_object(
    'status', 'attending',
    'promoted', jsonb_build_array()
  ),
  'den forreste i køen får selv pladsen ved at melde sig igen'
);

select is(
  public.respond_to_event(
    '00000000-0000-0000-0000-0000000000e1', 'attending'
  ),
  jsonb_build_object(
    'status', 'attending',
    'promoted', jsonb_build_array()
  ),
  'en deltager, der melder sig igen, beholder sin plads'
);

select results_eq(
  $$select user_id from public.event_attendance
    where event_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'attending'
    order by user_id$$,
  $$values
    ('00000000-0000-0000-0000-00000000000b'::uuid),
    ('00000000-0000-0000-0000-00000000000c'::uuid),
    ('00000000-0000-0000-0000-00000000000f'::uuid)$$,
  'pladserne er fyldt op igen, og ingen står i kø med en ledig plads'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
