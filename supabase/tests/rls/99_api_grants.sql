-- API-rollernes rettigheder er eksplicitte i migrationskæden (#209): CI's
-- bootstrap giver ikke længere nye objekter noget som helst, så det, appen
-- bruger, skal være givet af en migration -- og en glemt grant fejler her.
begin;

set local search_path = public, tests;

select plan(11);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );

  -- En tabel og en sekvens, som ingen migration har givet rettigheder til.
  -- Rulles tilbage med resten af testen.
  create table public.grant_probe (id integer primary key);
  alter table public.grant_probe enable row level security;
  create sequence public.grant_probe_seq;
end
$$;

-- Alice, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$select * from public.grant_probe$$,
  '42501',
  null,
  'en ny tabel uden grant er lukket for authenticated -- bootstrappen er stram'
);

select throws_ok(
  $$select nextval('public.grant_probe_seq')$$,
  '42501',
  null,
  'en ny sekvens uden grant er lukket for authenticated'
);

select lives_ok(
  $$select count(*) from public.profiles$$,
  'authenticated kan læse profiles (medlemsliste, chat, profil)'
);

select lives_ok(
  $$select count(*) from public.member_badges$$,
  'authenticated kan læse member_badges'
);

select lives_ok(
  $$select public.is_admin()$$,
  'authenticated kan køre is_admin() -- politikkerne kalder den'
);

select lives_ok(
  $$select 'Alice@Example.com'::public.citext = 'alice@example.com'::public.citext$$,
  'citext-operatorerne virker for authenticated (allowlist og ansøgninger)'
);

select is(
  has_table_privilege('authenticated', 'public.profiles', 'update'),
  false,
  'tabel-update på profiles er stadig trukket tilbage (#96) -- kun kolonnerne'
);

select is(
  has_function_privilege(
    'authenticated', 'public.pending_feature_announcement_pushes()', 'execute'
  ),
  false,
  'nyhedernes outbox er stadig kun for service_role'
);

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select lives_ok(
  $$select count(*) from public.activities$$,
  'anon kan læse activities (forsiden før login)'
);

select lives_ok(
  $$select count(*) from public.calendar_feed_events$$,
  'anon kan læse calendar_feed_events (den offentlige kalender)'
);

-- Edge Functionen
do $$ begin perform tests.login_service(); end $$;

select lives_ok(
  $$select count(*) from public.push_vapid_keys$$,
  'service_role kan læse push_vapid_keys (chat-push)'
);

select * from finish(true);

rollback;
