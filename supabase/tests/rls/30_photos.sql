-- Galleriet: metadata skrives kun gennem upsert_photo_upload, og
-- moderationssporet er kun for admins (#89, #114).
begin;

set local search_path = public, tests;

select plan(14);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'admin@example.com', true, '00000000-0000-0000-0000-0000000000ad'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select throws_ok(
  $$insert into public.photos (storage_path, uploaded_by)
    values (
      '00000000-0000-0000-0000-00000000000a/x.jpg',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'et medlem kan ikke skrive direkte i photos'
);

select throws_ok(
  $$select public.upsert_photo_upload(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-0000000000f1.jpg',
      null, null
    )$$,
  '22023',
  'Invalid photo storage path',
  'et medlem kan ikke registrere et billede i en andens mappe'
);

select throws_ok(
  $$select public.upsert_photo_upload(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000a/en-anden-fil.jpg',
      null, null
    )$$,
  '22023',
  'Invalid photo storage path',
  'stien skal indeholde billedets eget id, så to rækker ikke kan dele fil'
);

select lives_ok(
  $$select public.upsert_photo_upload(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f1.jpg',
      '  Solnedgang  ', null
    )$$,
  'et medlem kan registrere sit eget upload'
);

select results_eq(
  $$select uploaded_by, caption, optimization_status, optimized_path
    from public.photos
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  $$values (
      '00000000-0000-0000-0000-00000000000a'::uuid,
      'Solnedgang',
      'pending',
      null::text
    )$$,
  'RPC''en sætter ejer og serverejet status -- klienten kan ikke forfalske dem'
);

select throws_ok(
  $$update public.photos set optimization_status = 'ready'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501',
  null,
  'et medlem kan ikke rette sin egen række bagefter'
);

-- Bob prøver at kapre Alices billede
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select throws_ok(
  $$select public.upsert_photo_upload(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-0000000000f1.jpg',
      'Mit billede nu', null
    )$$,
  '42501',
  'Photo upload conflicts with an existing row',
  'et andet medlem kan ikke overtage et eksisterende billede'
);

select is(
  (
    select uploaded_by
    from public.photos
    where id = '00000000-0000-0000-0000-0000000000f1'
  ),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'ejeren står uændret efter kapringsforsøget'
);

select is(
  (select count(*)::int from public.photo_moderation_log),
  0,
  'et medlem kan ikke læse moderationssporet'
);

-- Admin
do $$
begin
  perform tests.reset_session();
  insert into public.photo_moderation_log (
    photo_id, actor_id, actor_name, uploader_id, uploader_name,
    storage_path, deletion_attempt
  )
  values (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000ad', 'Admin',
    '00000000-0000-0000-0000-00000000000a', 'Alice',
    '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f1.jpg',
    1
  );
  perform tests.login('00000000-0000-0000-0000-0000000000ad');
end
$$;

select is(
  (select count(*)::int from public.photo_moderation_log),
  1,
  'en admin kan læse moderationssporet'
);

select throws_ok(
  $$insert into public.photo_moderation_log (
      photo_id, actor_id, actor_name, uploader_id, uploader_name,
      storage_path, deletion_attempt
    ) values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-0000000000ad', 'Admin',
      '00000000-0000-0000-0000-00000000000a', 'Alice',
      '00000000-0000-0000-0000-00000000000a/x.jpg', 2
    )$$,
  '42501',
  null,
  'heller ikke en admin kan skrive i moderationssporet fra klienten'
);

do $$ begin perform tests.reset_session(); end $$;

-- Galleriets begivenhedsfilter (#149): kun begivenheder med billeder, med antal.
do $$
begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  insert into public.events (id, title, start_at, created_by)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    'Begivenhed med billede',
    now(),
    '00000000-0000-0000-0000-00000000000a'
  );
  insert into public.events (id, title, start_at, created_by)
  values (
    '00000000-0000-0000-0000-0000000000e2',
    'Begivenhed uden billede',
    now(),
    '00000000-0000-0000-0000-00000000000a'
  );
end
$$;

select lives_ok(
  $$select public.upsert_photo_upload(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f2.jpg',
      null,
      '00000000-0000-0000-0000-0000000000e1'
    )$$,
  'Alice kan knytte et billede til sin egen begivenhed'
);

select results_eq(
  $$select event_id, title, photo_count
    from public.gallery_event_photo_counts
    order by title$$,
  $$values (
      '00000000-0000-0000-0000-0000000000e1'::uuid,
      'Begivenhed med billede',
      1::bigint
    )$$,
  'kun begivenheder med billeder optræder i viewet, med korrekt antal'
);

do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select * from public.gallery_event_photo_counts$$,
  'anonyme kan ikke læse begivenhedernes billedantal'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
