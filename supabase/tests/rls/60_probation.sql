-- Ansøgninger om prøvemedlemskab: kun Edge Functionen må indsende, og
-- rate-limitten skal faktisk bide (#87).
begin;

set local search_path = public, tests;

select plan(15);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'admin@example.com', true, '00000000-0000-0000-0000-0000000000ad'
  );

  -- probation_notification_function_url() udleder værten af requestens headers
  -- og afviser alt, der ikke er et Supabase-funktionsdomæne.
  perform set_config(
    'request.headers', '{"host": "naturklubben.supabase.co"}', true
  );

  perform tests.logout();
end
$$;

select throws_ok(
  $$select * from public.submit_probation_application_limited(
      'Ny Ansøger', 'ny@example.com'::citext, 'Jeg elsker naturen',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  '42501',
  null,
  'anonyme kan ikke indsende en ansøgning uden om Edge Functionen'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$select * from public.submit_probation_application_limited(
      'Ny Ansøger', 'ny@example.com'::citext, 'Jeg elsker naturen',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  '42501',
  null,
  'et logget ind medlem kan heller ikke indsende direkte'
);

select is(
  (select count(*)::int from public.probation_applications),
  0,
  'et medlem kan ikke læse ansøgninger'
);

select throws_ok(
  $$select count(*) from public.probation_application_push_subscriptions$$,
  '42501',
  null,
  'ansøgerens push-endpoint er utilgængeligt for alle klientroller'
);

select throws_ok(
  $$select count(*) from private.probation_submission_attempts$$,
  '42501',
  null,
  'rate-limit-sporet ligger uden for klientens rækkevidde'
);

-- Edge Functionen (service_role)
do $$ begin perform tests.login_service(); end $$;

select throws_ok(
  $$select * from public.submit_probation_application_limited(
      'Ny Ansøger', 'ny@example.com'::citext, 'Jeg elsker naturen',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      'ikke-et-hash', repeat('b', 64), repeat('c', 64)
    )$$,
  '22023',
  'Rate-limit signals are invalid',
  'uhashede rate-limit-signaler afvises, så rå IP-adresser aldrig når tabellen'
);

select throws_ok(
  $$select * from public.submit_probation_application_limited(
      'Ny Ansøger', 'ny@example.com'::citext, 'Jeg elsker naturen',
      'https://evil.example.com/abc', 'p256dh', 'auth',
      repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  '22023',
  'Application fields are invalid',
  'et push-endpoint uden for de kendte pushtjenester afvises'
);

select results_eq(
  $$select * from public.submit_probation_application_limited(
      '  Ny Ansøger  ', 'Ny@Example.com'::citext, 'Jeg elsker naturen',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      repeat('a', 64), repeat('b', 64), repeat('c', 64)
    )$$,
  $$values ('accepted'::text, null::integer)$$,
  'Edge Functionen kan indsende en ansøgning'
);

select results_eq(
  $$select full_name, email::text, status
    from public.probation_applications$$,
  $$values ('Ny Ansøger', 'ny@example.com', 'pending')$$,
  'ansøgningen gemmes trimmet og med normaliseret e-mail'
);

select is(
  (select count(*)::int from public.probation_application_push_subscriptions),
  1,
  'push-abonnementet gemmes i samme transaktion som ansøgningen'
);

select results_eq(
  $$select * from public.submit_probation_application_limited(
      'Ny Ansøger', 'ny@example.com'::citext, 'Jeg elsker naturen',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      repeat('1', 64), repeat('2', 64), repeat('c', 64)
    )$$,
  $$values ('accepted'::text, null::integer)$$,
  'en gentagelse ser ud som en accept, så formularen ikke røber hvem der har søgt'
);

select results_eq(
  $$select * from public.submit_probation_application_limited(
      'Alice', 'alice@example.com'::citext, 'Jeg er allerede medlem',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      repeat('3', 64), repeat('4', 64), repeat('5', 64)
    )$$,
  $$values ('accepted'::text, null::integer)$$,
  'en adresse, der allerede er på allowlisten, ser også ud som en accept'
);

-- Fjerde forsøg fra samme IP inden for 15 minutter. Hvert forsøg har sit eget
-- e-mail- og netværkshash, så det kun er IP-grænsen, der kan udløses. Den
-- første ansøgning ovenfor talte allerede med, så to mere fylder kvoten op.
do $$
begin
  perform public.submit_probation_application_limited(
    'Anden', 'anden@example.com'::citext, 'Anden ansøgning',
    'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
    repeat('a', 64), repeat('d', 64), repeat('e', 64)
  );
  perform public.submit_probation_application_limited(
    'Tredje', 'tredje@example.com'::citext, 'Tredje ansøgning',
    'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
    repeat('a', 64), repeat('f', 64), repeat('0', 64)
  );
end
$$;

select results_eq(
  $$select submission_outcome, retry_after_seconds between 1 and 900
    from public.submit_probation_application_limited(
      'Fjerde', 'fjerde@example.com'::citext, 'Fjerde ansøgning',
      'https://fcm.googleapis.com/abc', 'p256dh', 'auth',
      repeat('a', 64), repeat('9', 64), repeat('8', 64)
    )$$,
  $$values ('rate_limited'::text, true)$$,
  'det fjerde forsøg fra samme IP afvises med et retry-vindue'
);

select is(
  (
    select count(*)::int
    from public.probation_applications
    where email = 'fjerde@example.com'::citext
  ),
  0,
  'den afviste ansøgning blev ikke oprettet'
);

-- Admin
do $$
begin
  perform tests.reset_session();
  perform tests.login('00000000-0000-0000-0000-0000000000ad');
end
$$;

select is(
  (select count(*)::int from public.probation_applications),
  3,
  'en admin kan læse ansøgningerne'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
