-- #224: offentlig kalender. Anon ser kun offentlige begivenheder og ingen
-- medlemsfelter; ansøgninger fra ikke-medlemmer kan kun oprettes af Edge
-- Functionen, kun læses og afgøres af arrangør/admin, og der er højst én åben
-- ansøgning pr. e-mail pr. begivenhed.
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
    'carol@example.com', true, '00000000-0000-0000-0000-00000000000c'
  );

  -- Alice arrangerer en offentlig og en privat tur.
  insert into public.events (id, title, description, start_at, created_by, is_public)
  values
    (
      '00000000-0000-0000-0000-0000000000e1',
      'Åben skovtur',
      'Alle er velkomne',
      now() + interval '7 days',
      '00000000-0000-0000-0000-00000000000a',
      true
    ),
    (
      '00000000-0000-0000-0000-0000000000e2',
      'Lukket bestyrelsesmøde',
      'Kun for medlemmer',
      now() + interval '8 days',
      '00000000-0000-0000-0000-00000000000a',
      false
    );

  -- event_guest_notification_function_url() udleder værten af requestens
  -- headers, som Edge Functionens PostgREST-kald sætter.
  perform set_config(
    'request.headers', '{"host": "naturklubben.supabase.co"}', true
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Anonym besøgende
-- ---------------------------------------------------------------------------
do $$ begin perform tests.logout(); end $$;

select results_eq(
  $$select title from public.events order by start_at$$,
  $$values ('Åben skovtur')$$,
  'anon ser kun offentlige begivenheder i events'
);

select throws_ok(
  $$select created_by from public.events$$,
  '42501',
  null,
  'anon kan ikke læse created_by -- arrangøren er ikke offentlig'
);

select throws_ok(
  $$select created_at from public.events$$,
  '42501',
  null,
  'anon kan heller ikke læse created_at'
);

select results_eq(
  $$select title, description from public.public_events$$,
  $$values ('Åben skovtur', 'Alle er velkomne')$$,
  'public_events viser kun den offentlige begivenhed med beskrivelse'
);

select hasnt_column(
  'public', 'public_events', 'created_by',
  'public_events har ingen created_by-kolonne'
);

select results_eq(
  $$select title from public.calendar_feed_events$$,
  $$values ('Åben skovtur')$$,
  'iCal-feedet indeholder kun offentlige begivenheder'
);

select throws_ok(
  $$select id from public.event_guest_requests$$,
  '42501',
  null,
  'anon kan ikke læse ansøgninger'
);

select throws_ok(
  $$select * from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e1', 'Gæst', 'gaest@example.com'::citext,
      null, 1, repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  '42501',
  null,
  'anon kan ikke indsende en ansøgning uden om Edge Functionen'
);

-- ---------------------------------------------------------------------------
-- Edge Functionen (service_role)
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login_service(); end $$;

select results_eq(
  $$select * from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e2', 'Gæst', 'gaest@example.com'::citext,
      null, 1, repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  $$values ('event_unavailable'::text, null::integer)$$,
  'en privat begivenhed tager ikke imod ansøgninger'
);

select throws_ok(
  $$select * from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e1', 'Gæst', 'gaest@example.com'::citext,
      null, 25, repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  '22023',
  'Request fields are invalid',
  'flere end 20 personer afvises'
);

select throws_ok(
  $$select * from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e1', 'Gæst', 'gaest@example.com'::citext,
      null, 1, 'ikke-et-hash', repeat('b', 64), repeat('c', 64)
    )$$,
  '22023',
  'Rate-limit signals are invalid',
  'uhashede rate-limit-signaler afvises'
);

select results_eq(
  $$select * from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e1', '  Gitte Gæst  ',
      'Gitte@Example.com'::citext, '  Vi er to voksne  ', 2,
      repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  $$values ('accepted'::text, null::integer)$$,
  'Edge Functionen kan indsende en ansøgning til en offentlig begivenhed'
);

select results_eq(
  $$select full_name, email::text, message, party_size, status
    from public.event_guest_requests$$,
  $$values ('Gitte Gæst', 'gitte@example.com', 'Vi er to voksne', 2, 'pending')$$,
  'ansøgningen gemmes trimmet og med normaliseret e-mail'
);

select results_eq(
  $$select * from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e1', 'Gitte Gæst',
      'gitte@example.com'::citext, 'Igen', 3,
      repeat('1', 64), repeat('2', 64), repeat('c', 64)
    )$$,
  $$values ('accepted'::text, null::integer)$$,
  'en gentagelse fra samme e-mail ser ud som en accept'
);

select is(
  (select count(*)::int from public.event_guest_requests),
  1,
  'men der oprettes ikke en ansøgning mere -- én åben pr. e-mail pr. begivenhed'
);

-- Fjerde forsøg fra samme IP inden for 15 minutter. Forsøget mod den private
-- begivenhed, Gittes første ansøgning og Tredje talte alle med (IP-hash 'a'),
-- så kvoten er fuld.
do $$
begin
  perform public.submit_event_guest_request_limited(
    '00000000-0000-0000-0000-0000000000e1', 'Tredje', 'tredje@example.com'::citext,
    null, 1, repeat('a', 64), repeat('d', 64), repeat('e', 64)
  );
end
$$;

select results_eq(
  $$select submission_outcome, retry_after_seconds between 1 and 900
    from public.submit_event_guest_request_limited(
      '00000000-0000-0000-0000-0000000000e1', 'Fjerde', 'fjerde@example.com'::citext,
      null, 1, repeat('a', 64), repeat('f', 64), repeat('0', 64)
    )$$,
  $$values ('rate_limited'::text, true)$$,
  'det fjerde forsøg fra samme IP afvises med et retry-vindue'
);

select is(
  (
    select count(*)::int from public.event_guest_requests
    where email = 'fjerde@example.com'::citext
  ),
  0,
  'den afviste ansøgning blev ikke oprettet'
);

-- Faste id'er, så de næste sektioner kan pege på ansøgningerne uden at kunne
-- læse dem.
do $$
begin
  perform tests.reset_session();
  update public.event_guest_requests
  set id = '00000000-0000-0000-0000-0000000000a1'
  where email = 'gitte@example.com'::citext;
  update public.event_guest_requests
  set id = '00000000-0000-0000-0000-0000000000a2'
  where email = 'tredje@example.com'::citext;
end
$$;

-- ---------------------------------------------------------------------------
-- Bob: medlem, men ikke arrangør
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (select count(id)::int from public.event_guest_requests),
  0,
  'et andet medlem kan ikke læse ansøgningerne'
);

select throws_ok(
  $$select public.approve_event_guest_request(
      '00000000-0000-0000-0000-0000000000a1'
    )$$,
  '42501',
  null,
  'et andet medlem kan ikke godkende en ansøgning'
);

select throws_ok(
  $$select public.reject_event_guest_request(
      '00000000-0000-0000-0000-0000000000a1'
    )$$,
  '42501',
  null,
  'et andet medlem kan heller ikke afvise en ansøgning'
);

do $$ begin perform tests.reset_session(); end $$;

select results_eq(
  $$select status from public.event_guest_requests order by email$$,
  $$values ('pending'), ('pending')$$,
  'ingen ansøgning blev afgjort af det andet medlem'
);

-- ---------------------------------------------------------------------------
-- Alice: arrangøren
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select results_eq(
  $$select full_name, party_size from public.event_guest_requests
    order by email$$,
  $$values ('Gitte Gæst', 2), ('Tredje', 1)$$,
  'arrangøren kan læse ansøgningerne på sin begivenhed'
);

select throws_ok(
  $$select notification_token from public.event_guest_requests$$,
  '42501',
  null,
  'arrangøren kan ikke læse leveringstoken'
);

select lives_ok(
  $$select public.approve_event_guest_request(
      '00000000-0000-0000-0000-0000000000a1'
    )$$,
  'arrangøren kan godkende en ansøgning'
);

select results_eq(
  $$select status, decision_notification_status
    from public.event_guest_requests
    where email = 'gitte@example.com'::citext$$,
  $$values ('approved', 'pending')$$,
  'godkendelsen sætter status og køer svaret til ansøgeren'
);

-- Alle medlemmer ser antallet af godkendte gæster, ikke hvem de er.
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select results_eq(
  $$select guest_count from public.event_guest_counts
    where event_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values (2)$$,
  'et almindeligt medlem ser gæstetallet for begivenheden'
);

-- ---------------------------------------------------------------------------
-- Carol: admin, ikke arrangør
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select lives_ok(
  $$select public.reject_event_guest_request(
      '00000000-0000-0000-0000-0000000000a2'
    )$$,
  'en admin kan afvise en ansøgning på en andens begivenhed'
);

select throws_ok(
  $$select public.reject_event_guest_request(
      '00000000-0000-0000-0000-0000000000a2'
    )$$,
  'P0002',
  null,
  'en afgjort ansøgning kan ikke afgøres igen'
);

-- ---------------------------------------------------------------------------
-- Levering: automatiske genforsøg har et loft, arrangørens "Send igen" har ikke
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login_service(); end $$;

update public.event_guest_requests
set decision_notification_status = 'failed',
    decision_notification_attempts = 10,
    decision_notification_started_at = now() - interval '1 hour'
where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  public.claim_event_guest_notification(
    '00000000-0000-0000-0000-0000000000a1'
  ),
  0,
  'et automatisk genforsøg stopper ved ti forsøg'
);

select is(
  public.claim_event_guest_notification(
    '00000000-0000-0000-0000-0000000000a1', true
  ),
  11,
  'arrangørens "Send igen" er fritaget fra forsøgsloftet'
);

select is(
  public.claim_event_guest_notification(
    '00000000-0000-0000-0000-0000000000a1', true
  ),
  0,
  'en levering, der er i gang, tages ikke igen -- heller ikke manuelt'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$select public.claim_event_guest_notification(
      '00000000-0000-0000-0000-0000000000a1', true
    )$$,
  '42501',
  null,
  'arrangøren kan ikke tage leveringen uden om Edge Functionen'
);

-- ---------------------------------------------------------------------------
-- Dataopbevaring og den unikke ansøgning pr. e-mail
-- ---------------------------------------------------------------------------
do $$ begin perform tests.reset_session(); end $$;

select throws_ok(
  $$insert into public.event_guest_requests
      (event_id, full_name, email, notification_function_url)
    values (
      '00000000-0000-0000-0000-0000000000e1', 'Gitte igen',
      'gitte@example.com', 'https://naturklubben.supabase.co/functions/v1/event-guest-notifications'
    )$$,
  '23505',
  null,
  'en godkendt gæst kan ikke få en ny åben ansøgning på samme begivenhed'
);

do $$
begin
  update public.events
  set start_at = now() - interval '40 days'
  where id = '00000000-0000-0000-0000-0000000000e1';
  perform public.purge_expired_event_guest_requests();
end
$$;

select is(
  (select count(*)::int from public.event_guest_requests),
  0,
  'gæstedata slettes 30 dage efter begivenheden'
);

select * from finish(true);

rollback;
