-- Album-forsiden og kommentarantal-badgen (#218): kun medlemmer kan læse
-- viewsne, coveret er det nyeste optimerede billede i albummet, og "Uden
-- begivenhed" er sit eget album med billeder uden event_id.
begin;

set local search_path = public, tests;

select plan(6);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');

  insert into public.events (id, title, start_at, created_by)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    'Skovtur',
    '2026-09-01T08:00:00+00',
    '00000000-0000-0000-0000-00000000000a'
  );

  perform public.upsert_photo_upload(
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f1.jpg',
    null,
    '00000000-0000-0000-0000-0000000000e1'
  );
  perform public.upsert_photo_upload(
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f2.jpg',
    null,
    '00000000-0000-0000-0000-0000000000e1'
  );
  perform public.upsert_photo_upload(
    '00000000-0000-0000-0000-0000000000f3',
    '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f3.jpg',
    null,
    null
  );

  perform public.create_photo_comment(
    '00000000-0000-0000-0000-0000000000f1', 'Flot udsigt'
  );
end
$$;

-- Kun optimize-image (Secret key) sætter normalt disse felter -- her sættes
-- de direkte med den privilegerede test-session, som en stedfortræder for
-- edge-functionen.
do $$
begin
  perform tests.reset_session();

  update public.photos
  set optimization_status = 'ready',
      optimized_path = 'e/f1.jpg',
      thumbnail_path = 'e/f1-thumb.jpg'
  where id = '00000000-0000-0000-0000-0000000000f1';

  -- f2 er nyere end f1 (indsat bagefter) og skal derfor vinde som cover.
  update public.photos
  set optimization_status = 'ready',
      optimized_path = 'e/f2.jpg',
      thumbnail_path = 'e/f2-thumb.jpg'
  where id = '00000000-0000-0000-0000-0000000000f2';

  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select results_eq(
  $$select event_id, title, start_at, photo_count, cover_photo_id
    from public.gallery_albums
    where event_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values (
      '00000000-0000-0000-0000-0000000000e1'::uuid,
      'Skovtur',
      '2026-09-01T08:00:00+00'::timestamptz,
      2::bigint,
      '00000000-0000-0000-0000-0000000000f2'::uuid
    )$$,
  'albummet med en begivenhed har det nyeste optimerede billede som cover'
);

select results_eq(
  $$select photo_count, cover_photo_id
    from public.gallery_albums
    where event_id is null$$,
  $$values (1::bigint, null::uuid)$$,
  '"Uden begivenhed" er sit eget album, uden cover før noget er optimeret'
);

do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select * from public.gallery_albums$$,
  '42501',
  null,
  'anonyme kan ikke læse album-oversigten'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select results_eq(
  $$select comment_count
    from public.photo_comment_counts
    where photo_id = '00000000-0000-0000-0000-0000000000f1'$$,
  $$values (1::bigint)$$,
  'kommentarantal-viewet tæller billedets kommentarer'
);

select is_empty(
  $$select 1
    from public.photo_comment_counts
    where photo_id = '00000000-0000-0000-0000-0000000000f2'$$,
  'et billede uden kommentarer har ingen række i viewet'
);

do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select * from public.photo_comment_counts$$,
  '42501',
  null,
  'anonyme kan ikke læse kommentarantal'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
