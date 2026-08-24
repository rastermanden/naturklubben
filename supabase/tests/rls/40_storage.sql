-- Storage: hver bruger skriver kun i sit eget præfiks, og en aktiv
-- slettereservation lukker for nye writes (#12, #86, #98).
begin;

set local search_path = public, tests;

select plan(10);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );

  -- Et optimeret billede lagt af Edge Functionen (Secret key omgår RLS).
  insert into storage.objects (bucket_id, name, owner)
  values (
    'photos-optimized',
    '00000000-0000-0000-0000-00000000000a/optimeret.webp',
    '00000000-0000-0000-0000-00000000000a'
  );

  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'photos-original',
      '00000000-0000-0000-0000-00000000000a/billede.jpg',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  'et medlem kan uploade i sit eget præfiks'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'photos-original',
      '00000000-0000-0000-0000-00000000000b/billede.jpg',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'et medlem kan ikke uploade i en andens præfiks'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'photos-original',
      '00000000-0000-0000-0000-00000000000a/andens-ejer.jpg',
      '00000000-0000-0000-0000-00000000000b'
    )$$,
  '42501',
  null,
  'et medlem kan ikke lægge et objekt med en anden ejer'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'photos-optimized',
      '00000000-0000-0000-0000-00000000000a/forfalsket.webp',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'kun Edge Functionen kan skrive i photos-optimized'
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'avatars',
      '00000000-0000-0000-0000-00000000000a/avatar.png',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  'et medlem kan uploade sin egen avatar'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'avatars',
      '00000000-0000-0000-0000-00000000000b/avatar.png',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'et medlem kan ikke overskrive en andens avatar'
);

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos-original'),
  0,
  'anonyme kan ikke se originalbillederne'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos-optimized'),
  1,
  'anonyme kan se de optimerede billeder'
);

-- En aktiv slettereservation lukker for nye writes i alle faner
do $$
begin
  perform tests.reset_session();
  update public.profiles
  set deletion_reserved_at = now()
  where id = '00000000-0000-0000-0000-00000000000a';
  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'photos-original',
      '00000000-0000-0000-0000-00000000000a/efter-reservation.jpg',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'en aktiv slettereservation blokerer nye uploads'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'avatars',
      '00000000-0000-0000-0000-00000000000a/ny-avatar.png',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'reservationen gælder også avatars'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
