-- Kommentarer til billeder (#218): kun medlemmer kan læse, kun forfatteren
-- selv eller en admin kan slette, og kommentarerne forsvinder med billedet.
begin;

set local search_path = public, tests;

select plan(17);

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
  perform public.upsert_photo_upload(
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f1.jpg',
    null, null
  );
end
$$;

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select 1 from public.photo_comments$$,
  'anonyme ser ingen kommentarer'
);

select throws_ok(
  $$select public.create_photo_comment(
      '00000000-0000-0000-0000-0000000000f1', 'Flot!'
    )$$,
  '42501',
  null,
  'anonyme kan ikke kalde create_photo_comment'
);

-- Alice, forfatteren
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$select public.create_photo_comment(
      '00000000-0000-0000-0000-0000000000f1', '  Flot billede!  '
    )$$,
  'et medlem kan kommentere et billede'
);

select results_eq(
  $$select user_id, body
    from public.photo_comments
    where photo_id = '00000000-0000-0000-0000-0000000000f1'$$,
  $$values (
      '00000000-0000-0000-0000-00000000000a'::uuid, 'Flot billede!'
    )$$,
  'RPC''en trimmer kommentaren og sætter afsenderen selv'
);

select throws_ok(
  $$select public.create_photo_comment(
      '00000000-0000-0000-0000-0000000000f1', '   '
    )$$,
  '22023',
  'photo_comment_invalid_body',
  'en tom (kun blanktegn) kommentar afvises'
);

select throws_ok(
  $$select public.create_photo_comment(
      '00000000-0000-0000-0000-0000000000f9', 'Hej'
    )$$,
  'P0002',
  'photo_comment_photo_not_found',
  'man kan ikke kommentere et billede, der ikke findes'
);

select throws_ok(
  $$insert into public.photo_comments (photo_id, user_id, body)
    values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000a',
      'Uden om RPC''en'
    )$$,
  '42501',
  null,
  'et medlem kan ikke indsætte en kommentar direkte i tabellen'
);

-- Bob, et andet medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (
    select count(*)::int
    from public.photo_comments
    where photo_id = '00000000-0000-0000-0000-0000000000f1'
  ),
  1,
  'et andet medlem kan læse kommentaren'
);

select lives_ok(
  $$select public.create_photo_comment(
      '00000000-0000-0000-0000-0000000000f1', 'Enig!'
    )$$,
  'et andet medlem kan også kommentere'
);

select throws_ok(
  $$select public.delete_photo_comment(
      (select id from public.photo_comments where body = 'Flot billede!')
    )$$,
  '42501',
  'photo_comment_delete_not_authorized',
  'et medlem kan ikke slette en andens kommentar'
);

select is(
  (select count(*)::int from public.photo_comments where body = 'Flot billede!'),
  1,
  'den afviste sletning lod kommentaren stå'
);

select lives_ok(
  $$select public.delete_photo_comment(
      (select id from public.photo_comments where body = 'Enig!')
    )$$,
  'et medlem kan slette sin egen kommentar'
);

select throws_ok(
  $$select public.delete_photo_comment('00000000-0000-0000-0000-00000000ffff')$$,
  'P0002',
  'photo_comment_delete_not_found',
  'sletning af en kommentar, der ikke findes, fejler tydeligt'
);

-- Admin
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000ad'); end $$;

select lives_ok(
  $$select public.delete_photo_comment(
      (select id from public.photo_comments where body = 'Flot billede!')
    )$$,
  'en admin kan slette en andens kommentar'
);

select is(
  (select count(*)::int from public.photo_comments),
  0,
  'begge kommentarer er nu væk'
);

-- Kommentarer forsvinder med billedet (#218).
do $$
begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  perform public.upsert_photo_upload(
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f2.jpg',
    null, null
  );
  perform public.create_photo_comment(
    '00000000-0000-0000-0000-0000000000f2', 'Kommentar til billede 2'
  );
end
$$;

select is(
  (
    select count(*)::int
    from public.photo_comments
    where photo_id = '00000000-0000-0000-0000-0000000000f2'
  ),
  1,
  'kommentaren findes, før billedet slettes'
);

do $$
begin
  perform tests.reset_session();
  delete from public.photos where id = '00000000-0000-0000-0000-0000000000f2';
end
$$;

select is(
  (
    select count(*)::int
    from public.photo_comments
    where photo_id = '00000000-0000-0000-0000-0000000000f2'
  ),
  0,
  'sletning af billedet kaskaderer til dets kommentarer'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
