-- Push-notifikationer ud over chatten (#216): præferencer, leveringslog og
-- den planlagte påmindelse dagen før.
--
-- Hele filen kører i én transaktion, der rulles tilbage, så fixtures ikke
-- lækker til de øvrige testfiler.
begin;

set local search_path = public, tests;

select plan(52);

do $$
begin
  perform tests.create_member(
    'ida@example.com', false, '00000000-0000-0000-0000-0000000000f1'
  );
  perform tests.create_member(
    'jens@example.com', false, '00000000-0000-0000-0000-0000000000f2'
  );
  perform tests.create_member(
    'karen@example.com', true, '00000000-0000-0000-0000-0000000000f3'
  );

  -- Idas telefon. Jens har ingen enhed.
  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
  values (
    '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-0000000000f1',
    'https://fcm.googleapis.com/fcm/send/ida-telefon',
    'p256dh',
    'auth'
  );

end
$$;

-- ---------------------------------------------------------------------------
-- Produktionen, den dag migrationen lander: en kommende begivenhed fandtes
-- allerede (ingen URL, for triggeren så aldrig et request), ingen begivenhed
-- er endnu oprettet fra appen, men ansøgningerne om prøvemedlemskab har husket
-- functions-hosten.
-- ---------------------------------------------------------------------------
insert into public.events (id, title, start_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000e0',
  'Tur oprettet før migrationen',
  now() + interval '2 hours',
  '00000000-0000-0000-0000-0000000000f1'
);

insert into public.probation_applications (
  full_name, email, motivation, notification_function_url
)
values (
  'Ansøger',
  'ansoeger@example.com',
  'Vil gerne med',
  'https://naturklubben.supabase.co/functions/v1/probation-notifications'
);

select is(
  (
    select notification_function_url
    from public.events
    where id = '00000000-0000-0000-0000-0000000000e0'
  ),
  null,
  'en begivenhed fra før migrationen har ingen URL'
);

select is(
  public.enqueue_event_reminders(),
  1,
  'uden nogen begivenhed fra appen lånes hosten fra en ansøgning'
);

select results_eq(
  $$select status, attempts
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e0'$$,
  $$values ('sending'::text, 1)$$,
  'påmindelsen om den gamle begivenhed er sat i kø'
);

-- Triggeren på events udleder functionens URL af requestets host-header,
-- præcis som probation_notification_function_url().
do $$
begin
  perform set_config(
    'request.headers', '{"host": "naturklubben.supabase.co"}', true
  );
end
$$;

-- Ida opretter to begivenheder fra appen: én om et par timer (inden for
-- påmindelsesvinduet uanset hvornår testen kører) og én om en uge.
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f1'); end $$;

insert into public.events (id, title, start_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000e1',
  'Svampetur',
  now() + interval '2 hours',
  '00000000-0000-0000-0000-0000000000f1'
), (
  '00000000-0000-0000-0000-0000000000e2',
  'Fugletur om en uge',
  now() + interval '7 days',
  '00000000-0000-0000-0000-0000000000f1'
);

select is(
  (
    select notification_function_url
    from public.events
    where id = '00000000-0000-0000-0000-0000000000e1'
  ),
  'https://naturklubben.supabase.co/functions/v1/calendar-push',
  'functionens URL udledes af requestets host, når en begivenhed oprettes'
);

update public.events
set notification_function_url = 'https://evil.example.com/steal'
where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (
    select notification_function_url
    from public.events
    where id = '00000000-0000-0000-0000-0000000000e1'
  ),
  'https://naturklubben.supabase.co/functions/v1/calendar-push',
  'et medlem kan ikke pege påmindelsen mod en fremmed host'
);

update public.events
set title = 'Tur oprettet før migrationen, redigeret',
    notification_function_url = 'https://evil.example.com/steal'
where id = '00000000-0000-0000-0000-0000000000e0';

select is(
  (
    select notification_function_url
    from public.events
    where id = '00000000-0000-0000-0000-0000000000e0'
  ),
  'https://naturklubben.supabase.co/functions/v1/calendar-push',
  'en begivenhed uden URL får requestets host, når den redigeres -- ikke en fremmed'
);

-- ---------------------------------------------------------------------------
-- Præferencer
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.notification_preferences),
  0,
  'ingen række, før medlemmet selv rører valget -- typerne er slået til'
);

select lives_ok(
  $$select public.set_notification_preference('event_reminder', false)$$,
  'et medlem kan slå påmindelser fra'
);

select is(
  (
    select enabled
    from public.notification_preferences
    where user_id = '00000000-0000-0000-0000-0000000000f1'
      and kind = 'event_reminder'
  ),
  false,
  'valget gemmes på medlemmet selv'
);

select lives_ok(
  $$select public.set_notification_preference('event_reminder', true)$$,
  'og til igen'
);

select is(
  (
    select count(*)::int
    from public.notification_preferences
    where user_id = '00000000-0000-0000-0000-0000000000f1'
  ),
  1,
  'et gentaget valg opdaterer rækken i stedet for at lægge en ny til'
);

select throws_ok(
  $$select public.set_notification_preference('waitlist', true)$$,
  '22023',
  null,
  'en ukendt type afvises'
);

select throws_ok(
  $$insert into public.notification_preferences (user_id, kind, enabled)
    values ('00000000-0000-0000-0000-0000000000f2', 'event_created', false)$$,
  '42501',
  null,
  'valg skrives kun gennem RPC''en -- ikke direkte i tabellen'
);

select throws_ok(
  $$select public.enqueue_event_reminders()$$,
  '42501',
  null,
  'et medlem kan ikke sætte påmindelserne i gang'
);

-- Karen, admin: beskeden om nye indstillinger til godkendelse er hendes.
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f3'); end $$;

select lives_ok(
  $$select public.set_notification_preference('badge_nomination_review', false)$$,
  'en admin kan slå besked om nye indstillinger til godkendelse fra'
);

-- Jens, et andet medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f2'); end $$;

select is(
  (select count(*)::int from public.notification_preferences),
  0,
  'et medlem kan ikke se andres valg'
);

select throws_ok(
  $$select count(*) from public.push_deliveries$$,
  '42501',
  null,
  'et medlem kan ikke se, hvem der har fået hvilken notifikation'
);

select throws_ok(
  $$select * from public.claim_push_deliveries(
      'event_created',
      '00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-0000000000f1']::uuid[]
    )$$,
  '42501',
  null,
  'et medlem kan ikke tage modtagere i leveringsloggen'
);

select throws_ok(
  $$select count(*) from public.event_reminders$$,
  '42501',
  null,
  'påmindelsernes status er driftsdata og lukket for klientroller'
);

select throws_ok(
  $$select public.claim_event_reminder(
      '00000000-0000-0000-0000-0000000000e1',
      gen_random_uuid()
    )$$,
  '42501',
  null,
  'et medlem kan ikke tage en påmindelse til levering'
);

-- Anonym
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select public.set_notification_preference('event_created', false)$$,
  '42501',
  null,
  'anonyme kan ikke sætte et valg'
);

select throws_ok(
  $$select count(*) from public.notification_preferences$$,
  '42501',
  null,
  'anonyme kan ikke læse valg'
);

-- ---------------------------------------------------------------------------
-- Den planlagte kørsel (pg_cron kører som databasens egen rolle)
-- ---------------------------------------------------------------------------
do $$ begin perform tests.reset_session(); end $$;

-- En gammel post i loggen, som kørslen skal rydde op.
insert into public.push_deliveries (kind, subject_id, user_id, sent_at)
values (
  'event_created',
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-0000000000f1',
  now() - interval '100 days'
);

select is(
  public.enqueue_event_reminders(),
  1,
  'kun begivenheden inden for vinduet sættes i kø -- ikke den om en uge'
);

select results_eq(
  $$select status, attempts
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('sending'::text, 1)$$,
  'kørslen står som i gang med første forsøg'
);

select is(
  (
    select count(*)::int
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e2'
  ),
  0,
  'begivenheden om en uge har ingen kørsel endnu'
);

select is(
  public.enqueue_event_reminders(),
  0,
  'en kørsel, der lige er startet, sættes ikke i kø igen'
);

select is(
  (
    select count(*)::int
    from public.push_deliveries
    where subject_id = '00000000-0000-0000-0000-0000000000a0'
  ),
  0,
  'poster ældre end 90 dage ryddes af kørslen'
);

-- Edge Functionen (service_role)
do $$ begin perform tests.login_service(); end $$;

select lives_ok(
  $$select count(*) from public.event_reminders$$,
  'functionen kan læse påmindelsernes status'
);

select is(
  (
    select public.claim_event_reminder(
      '00000000-0000-0000-0000-0000000000e1',
      gen_random_uuid()
    )
  ),
  0,
  'et forkert token får ingenting'
);

select is(
  (
    select public.claim_event_reminder(
      '00000000-0000-0000-0000-0000000000e1',
      (
        select token
        from public.event_reminders
        where event_id = '00000000-0000-0000-0000-0000000000e1'
      )
    )
  ),
  1,
  'kørslens eget token giver forsøgsnummeret'
);

select set_eq(
  $$select * from public.claim_push_deliveries(
      'event_reminder',
      '00000000-0000-0000-0000-0000000000e1',
      array[
        '00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000f2'
      ]::uuid[]
    )$$,
  array[
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f2'
  ]::uuid[],
  'første claim giver alle modtagerne'
);

select is_empty(
  $$select * from public.claim_push_deliveries(
      'event_reminder',
      '00000000-0000-0000-0000-0000000000e1',
      array[
        '00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000f2'
      ]::uuid[]
    )$$,
  'en gentagelse giver ingen -- ingen får den samme påmindelse to gange'
);

select set_eq(
  $$select * from public.claim_push_deliveries(
      'event_reminder',
      '00000000-0000-0000-0000-0000000000e1',
      array[
        '00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000f3'
      ]::uuid[]
    )$$,
  array['00000000-0000-0000-0000-0000000000f3']::uuid[],
  'en, der er kommet til siden, får sin -- de andre ikke igen'
);

select set_eq(
  $$select * from public.claim_push_deliveries(
      'event_created',
      '00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-0000000000f1']::uuid[]
    )$$,
  array['00000000-0000-0000-0000-0000000000f1']::uuid[],
  'loggen er pr. type: "ny begivenhed" og påmindelsen om den samme tæller hver for sig'
);

select is_empty(
  $$select * from public.claim_push_deliveries(
      'event_created',
      '00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-000000000099']::uuid[]
    )$$,
  'et medlem, der ikke findes længere, springes over uden fejl'
);

select throws_ok(
  $$select * from public.claim_push_deliveries(
      'waitlist',
      '00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-0000000000f1']::uuid[]
    )$$,
  '23514',
  null,
  'loggen afviser en type, præferencerne ikke kender -- en stavefejl fejler højt'
);

select lives_ok(
  $$select public.complete_event_reminder(
      '00000000-0000-0000-0000-0000000000e1', 1, true
    )$$,
  'functionen kan melde kørslen færdig'
);

select results_eq(
  $$select status, sent_at is not null
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('sent'::text, true)$$,
  'kørslen står som sendt'
);

-- Tilbage til cron
do $$ begin perform tests.reset_session(); end $$;

select is(
  public.enqueue_event_reminders(),
  0,
  'en påmindelse, der lige er sendt, gentages ikke med det samme'
);

-- En time senere: kørslen gentages, så en, der har tilmeldt sig i mellemtiden,
-- også får sin påmindelse. Loggen ovenfor holder de andre fri.
update public.event_reminders
set started_at = now() - interval '2 hours'
where event_id = '00000000-0000-0000-0000-0000000000e1';

select is(
  public.enqueue_event_reminders(),
  1,
  'efter en time kigges der forbi igen'
);

select results_eq(
  $$select status, attempts
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('sending'::text, 2)$$,
  'gentagelsen tæller som et nyt forsøg'
);

-- En begivenhed oprettet uden request (fx fra psql) har ingen URL selv, men
-- kørslen låner den seneste kendte -- det er samme host for alle.
do $$
begin
  perform set_config('request.headers', '', true);
  insert into public.events (id, title, start_at, created_by)
  values (
    '00000000-0000-0000-0000-0000000000e3',
    'Aftentur uden request',
    now() + interval '3 hours',
    '00000000-0000-0000-0000-0000000000f1'
  );
end
$$;

select is(
  (
    select notification_function_url
    from public.events
    where id = '00000000-0000-0000-0000-0000000000e3'
  ),
  null,
  'uden en host-header gemmes ingen URL -- og intet fejler'
);

select is(
  public.enqueue_event_reminders(),
  1,
  'kørslen falder tilbage til den seneste kendte URL'
);

-- ---------------------------------------------------------------------------
-- Begivenheden flyttes, efter påmindelsen er sendt
-- ---------------------------------------------------------------------------
-- Ida ejer Svampeturen og redigerer den fra appen. Et nyt klokkeslæt samme
-- dag rører ikke loggen; en anden dag glemmer den, så vinduet dagen før den
-- nye dato sender forfra.
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f1'); end $$;

update public.events
set start_at = (
  (start_at at time zone 'Europe/Copenhagen')::date + time '23:30'
) at time zone 'Europe/Copenhagen'
where id = '00000000-0000-0000-0000-0000000000e1';

-- Loggen og kørslerne er lukket for medlemmer (test 17 og 19), så de
-- aflæses uden for Idas session.
do $$ begin perform tests.reset_session(); end $$;

select is(
  (
    select count(*)::int
    from public.push_deliveries
    where kind = 'event_reminder'
      and subject_id = '00000000-0000-0000-0000-0000000000e1'
  ),
  3,
  'et nyt klokkeslæt samme dag beholder leveringsloggen'
);

select is(
  (
    select count(*)::int
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e1'
  ),
  1,
  'og kørslen'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f1'); end $$;

update public.events
set start_at = start_at + interval '7 days'
where id = '00000000-0000-0000-0000-0000000000e1';

do $$ begin perform tests.reset_session(); end $$;

select is(
  (
    select count(*)::int
    from public.push_deliveries
    where kind = 'event_reminder'
      and subject_id = '00000000-0000-0000-0000-0000000000e1'
  ),
  0,
  'flyttes begivenheden til en anden dag, glemmes påmindelsen'
);

select is(
  (
    select count(*)::int
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e1'
  ),
  0,
  'og kørslen ryddes'
);

select is(
  (
    select count(*)::int
    from public.push_deliveries
    where kind = 'event_created'
      and subject_id = '00000000-0000-0000-0000-0000000000e1'
  ),
  1,
  '"ny begivenhed" om den samme sendes ikke igen'
);

select is(
  public.enqueue_event_reminders(),
  0,
  'en uge ude er der intet at sende endnu'
);

-- Dagen før den nye dato (her: tilbage i vinduet).
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f1'); end $$;

update public.events
set start_at = now() + interval '2 hours'
where id = '00000000-0000-0000-0000-0000000000e1';

do $$ begin perform tests.reset_session(); end $$;

select is(
  public.enqueue_event_reminders(),
  1,
  'i vinduet før den nye dato sendes påmindelsen forfra'
);

select results_eq(
  $$select status, attempts
    from public.event_reminders
    where event_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('sending'::text, 1)$$,
  'som en ny kørsel med første forsøg'
);

do $$ begin perform tests.login_service(); end $$;

select set_eq(
  $$select * from public.claim_push_deliveries(
      'event_reminder',
      '00000000-0000-0000-0000-0000000000e1',
      array[
        '00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000f2'
      ]::uuid[]
    )$$,
  array[
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f2'
  ]::uuid[],
  'de tilmeldte får påmindelsen om den nye dato'
);

select * from finish(true);

rollback;
