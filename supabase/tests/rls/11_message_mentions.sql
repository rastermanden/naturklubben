-- Mentions på beskeder og notifikationspræferencen på profilen (#179).
-- Hele filen kører i én transaktion, der rulles tilbage, så fixtures ikke
-- lækker til de øvrige testfiler.
begin;

set local search_path = public, tests;

select plan(13);

do $$
begin
  perform tests.create_member(
    'mia@example.com', false, '00000000-0000-0000-0000-00000000000c'
  );
  perform tests.create_member(
    'noah@example.com', false, '00000000-0000-0000-0000-00000000000d'
  );

  insert into public.messages (id, user_id, content, mentions)
  values (
    '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-00000000000d',
    'Hej @Mia, kommer du?',
    array['00000000-0000-0000-0000-00000000000c']::uuid[]
  );
end
$$;

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select is(
  (select count(*)::int from public.messages),
  0,
  'anonyme kan ikke læse mentions, fordi de ikke kan læse beskeder'
);

-- Mia, den nævnte
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select is(
  (
    select mentions
    from public.messages
    where id = '00000000-0000-0000-0000-0000000000d1'
  ),
  array['00000000-0000-0000-0000-00000000000c']::uuid[],
  'et medlem kan læse mentions på linje med resten af beskeden'
);

select lives_ok(
  $$insert into public.messages (id, user_id, content, mentions)
    values (
      '00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-00000000000c',
      'Ja, jeg kommer @Noah',
      array['00000000-0000-0000-0000-00000000000d']::uuid[]
    )$$,
  'afsenderen kan sende sin egen besked med mentions'
);

select throws_ok(
  $$insert into public.messages (user_id, content, mentions)
    values (
      '00000000-0000-0000-0000-00000000000d',
      'Falsk afsender',
      array['00000000-0000-0000-0000-00000000000c']::uuid[]
    )$$,
  '42501',
  null,
  'et medlem kan ikke lægge mentions på en besked i en andens navn'
);

select throws_ok(
  $$update public.messages
    set mentions = array['00000000-0000-0000-0000-00000000000c']::uuid[]
    where id = '00000000-0000-0000-0000-0000000000d1'$$,
  '42501',
  null,
  'et medlem kan ikke skrive mentions ind på en andens besked bagefter'
);

select throws_ok(
  $$update public.messages
    set mentions = '{}'::uuid[]
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501',
  null,
  'heller ikke på sin egen besked -- beskeder redigeres ikke'
);

select is(
  (
    select mentions
    from public.messages
    where id = '00000000-0000-0000-0000-0000000000d1'
  ),
  array['00000000-0000-0000-0000-00000000000c']::uuid[],
  'de afviste forsøg efterlod mentions urørt'
);

select throws_ok(
  $$insert into public.messages (user_id, content, mentions)
    select
      '00000000-0000-0000-0000-00000000000c',
      'For mange nævnte',
      array_agg(gen_random_uuid())
    from generate_series(1, 21)$$,
  '23514',
  null,
  'en besked kan højst nævne 20 medlemmer'
);

select throws_ok(
  $$insert into public.messages (user_id, content, mentions)
    values (
      '00000000-0000-0000-0000-00000000000c',
      'Tomt element',
      array[null]::uuid[]
    )$$,
  '23514',
  null,
  'mentions kan ikke indeholde et tomt element'
);

select lives_ok(
  $$select public.soft_delete_message(
      '00000000-0000-0000-0000-0000000000c1'
    )$$,
  'ejeren kan slette sin egen besked med mentions'
);

select results_eq(
  $$select content, mentions
    from public.messages
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values ('', '{}'::uuid[])$$,
  'sletningen rydder mentions sammen med indholdet'
);

-- Notifikationspræferencen er personlig og hører til profilen.
select lives_ok(
  $$update public.profiles
    set chat_notification_preference = 'mentions'
    where id = '00000000-0000-0000-0000-00000000000c'$$,
  'et medlem kan vælge kun at få notifikationer, når det nævnes'
);

do $$
begin
  update public.profiles
  set chat_notification_preference = 'none'
  where id = '00000000-0000-0000-0000-00000000000d';
end
$$;

select is(
  (
    select chat_notification_preference
    from public.profiles
    where id = '00000000-0000-0000-0000-00000000000d'
  ),
  'all',
  'et medlem kan ikke skrue ned for en andens notifikationer'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
