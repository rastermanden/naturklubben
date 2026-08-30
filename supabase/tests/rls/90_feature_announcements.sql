-- Nyheder om nye funktioner: hvem kan læse dem, hvem kan skrive dem, og hvem
-- kan sende dem ud (#184).
--
-- Hele filen kører i én transaktion, der rulles tilbage, så fixtures ikke
-- lækker til de øvrige testfiler.
begin;

set local search_path = public, tests;

select plan(25);

do $$
begin
  perform tests.create_member(
    'ida@example.com', false, '00000000-0000-0000-0000-0000000000f1'
  );
  perform tests.create_member(
    'jens@example.com', false, '00000000-0000-0000-0000-0000000000f2'
  );

  insert into public.feature_announcements (id, slug, title, body, path)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    'en-testnyhed',
    'En testnyhed',
    'Noget nyt er landet i appen.',
    'kalender'
  );

  -- En nyhed, der endnu ikke er udgivet, må ikke kunne læses forlods.
  insert into public.feature_announcements (
    id, slug, title, body, released_at
  )
  values (
    '00000000-0000-0000-0000-0000000000e2',
    'en-kommende-nyhed',
    'En kommende nyhed',
    'Den er ikke sluppet ud endnu.',
    now() + interval '1 day'
  );

  -- Idas telefon. Leveringsloggen hænger på abonnementet, ikke på medlemmet.
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

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select count(*) from public.feature_announcements$$,
  '42501',
  null,
  'anonyme kan ikke læse klubbens nyheder'
);

-- Ida, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f1'); end $$;

select is(
  (
    select title
    from public.feature_announcements
    where slug = 'en-testnyhed'
  ),
  'En testnyhed',
  'et medlem kan læse en udgivet nyhed'
);

select is(
  (
    select count(*)::int
    from public.feature_announcements
    where slug = 'en-kommende-nyhed'
  ),
  0,
  'en nyhed med et fremtidigt udgivelsestidspunkt er ikke sluppet ud endnu'
);

select throws_ok(
  $$select push_status from public.feature_announcements$$,
  '42501',
  null,
  'leveringsstatus er driftsdata og ikke en del af nyheden'
);

select throws_ok(
  $$insert into public.feature_announcements (slug, title, body)
    values ('min-egen-nyhed', 'Min egen nyhed', 'Skrevet i browseren')$$,
  '42501',
  null,
  'et medlem kan ikke skrive en nyhed -- de kommer fra migrationer'
);

select throws_ok(
  $$update public.feature_announcements
    set title = 'Kapret'
    where slug = 'en-testnyhed'$$,
  '42501',
  null,
  'et medlem kan ikke omskrive en nyhed'
);

select throws_ok(
  $$delete from public.feature_announcements where slug = 'en-testnyhed'$$,
  '42501',
  null,
  'et medlem kan ikke slette en nyhed'
);

select lives_ok(
  $$insert into public.feature_announcement_reads (announcement_id, user_id)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      '00000000-0000-0000-0000-0000000000f1'
    )$$,
  'et medlem kan markere en nyhed som læst'
);

select throws_ok(
  $$insert into public.feature_announcement_reads (announcement_id, user_id)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      '00000000-0000-0000-0000-0000000000f2'
    )$$,
  '42501',
  null,
  'et medlem kan ikke markere nyheden som læst på en andens vegne'
);

select throws_ok(
  $$update public.feature_announcement_reads
    set read_at = now() - interval '1 year'$$,
  '42501',
  null,
  'læsetidspunktet er ikke noget, der redigeres bagefter'
);

select lives_ok(
  $$update public.profiles
    set feature_notifications_enabled = false
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'et medlem kan slå notifikationer om nye funktioner fra'
);

select is(
  (
    select feature_notifications_enabled
    from public.profiles
    where id = '00000000-0000-0000-0000-0000000000f1'
  ),
  false,
  'valget bliver gemt på medlemmets egen profil'
);

-- Jens, et andet medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f2'); end $$;

select is(
  (select count(*)::int from public.feature_announcement_reads),
  0,
  'et medlem kan ikke se, hvad andre har læst'
);

select throws_ok(
  $$select count(*) from public.feature_announcement_push_deliveries$$,
  '42501',
  null,
  'et medlem kan ikke se, hvilke enheder der har fået en notifikation'
);

select throws_ok(
  $$insert into public.feature_announcement_push_deliveries
      (announcement_id, subscription_id)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      '00000000-0000-0000-0000-0000000000d1'
    )$$,
  '42501',
  null,
  'et medlem kan ikke skrive i leveringsloggen'
);

-- Ida har slået dem fra ovenfor. Jens' forsøg på at slå dem til igen rammer
-- ingen rækker, fordi profilpolitikken kun lader ham røre sin egen.
update public.profiles
set feature_notifications_enabled = true
where id = '00000000-0000-0000-0000-0000000000f1';

do $$ begin perform tests.reset_session(); end $$;

select is(
  (
    select feature_notifications_enabled
    from public.profiles
    where id = '00000000-0000-0000-0000-0000000000f1'
  ),
  false,
  'et medlem kan ikke sætte en andens notifikationsvalg'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000f2'); end $$;

select throws_ok(
  $$select public.claim_feature_announcement_push(
      '00000000-0000-0000-0000-0000000000e1'
    )$$,
  '42501',
  null,
  'et medlem kan ikke tage en nyhed og dermed udløse en udsendelse'
);

select throws_ok(
  $$select * from public.pending_feature_announcement_pushes()$$,
  '42501',
  null,
  'et medlem kan ikke se, hvilke nyheder der mangler at blive sendt'
);

select throws_ok(
  $$select public.complete_feature_announcement_push(
      '00000000-0000-0000-0000-0000000000e1', 1, true
    )$$,
  '42501',
  null,
  'et medlem kan ikke melde en udsendelse færdig'
);

-- Edge Functionen (service_role)
do $$ begin perform tests.login_service(); end $$;

select is(
  (
    select public.claim_feature_announcement_push(
      '00000000-0000-0000-0000-0000000000e1'
    )
  ),
  1,
  'functionen kan tage det første leveringsforsøg'
);

select is(
  (
    select public.claim_feature_announcement_push(
      '00000000-0000-0000-0000-0000000000e1'
    )
  ),
  0,
  'den næste klient, der kalder, får ingenting -- nyheden sendes kun én gang'
);

select is(
  (
    select public.claim_feature_announcement_push(
      '00000000-0000-0000-0000-0000000000e2'
    )
  ),
  0,
  'en nyhed, der ikke er udgivet endnu, kan ikke sendes'
);

select lives_ok(
  $$insert into public.feature_announcement_push_deliveries
      (announcement_id, subscription_id)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      '00000000-0000-0000-0000-0000000000d1'
    )$$,
  'functionen kan skrive ned, at enheden har fået nyheden -- så et genforsøg '
  || 'kan lade den være'
);

-- Loggen holder ikke liv i et abonnement, der er væk: slår medlemmet
-- notifikationer fra eller sletter sin konto, forsvinder leveringerne med.
delete from public.push_subscriptions
where id = '00000000-0000-0000-0000-0000000000d1';

select is(
  (select count(*)::int from public.feature_announcement_push_deliveries),
  0,
  'leveringen forsvinder sammen med det abonnement, den handler om'
);

do $$
begin
  perform public.complete_feature_announcement_push(
    '00000000-0000-0000-0000-0000000000e1', 1, true
  );
end
$$;

select is(
  (
    select push_status
    from public.feature_announcements
    where id = '00000000-0000-0000-0000-0000000000e1'
  ),
  'sent',
  'nyheden står som sendt, når functionen melder tilbage'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
