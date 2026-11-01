-- Læsekvitteringer i chatten (#294): et medlem kan kun flytte sin egen
-- læseposition og kun fremad; alle indloggede kan se positionerne i det
-- fælles rum, kun admins dem i admin-rummet; anonyme kan intet.
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
    'dina-admin@example.com', true, '00000000-0000-0000-0000-00000000000d'
  );

  insert into public.messages (id, user_id, content, created_at)
  values
    ('00000000-0000-0000-0000-0000000000f1',
     '00000000-0000-0000-0000-00000000000a', 'Hej', '2026-11-01T10:00:00Z'),
    ('00000000-0000-0000-0000-0000000000f2',
     '00000000-0000-0000-0000-00000000000b', 'Hej selv', '2026-11-01T10:01:00Z'),
    ('00000000-0000-0000-0000-0000000000f3',
     '00000000-0000-0000-0000-00000000000a', 'Tur lørdag?', '2026-11-01T10:02:00Z');

  insert into public.messages (id, user_id, content, room, created_at)
  values
    ('00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-00000000000d', 'Budget', 'admin',
     '2026-11-01T10:00:00Z');
end
$$;

-- Anonyme
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000f1')$$,
  '42501',
  null,
  'en anonym kan ikke markere noget som læst'
);

-- Bob læser det fælles rum
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select lives_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000f2')$$,
  'Bob kan markere en besked som læst'
);

select is(
  (select last_read_message_id from public.chat_read_positions
    where user_id = '00000000-0000-0000-0000-00000000000b' and room = 'general'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'Bobs position står på beskeden'
);

select lives_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000f1')$$,
  'en ældre besked er ikke en fejl'
);

select is(
  (select last_read_message_id from public.chat_read_positions
    where user_id = '00000000-0000-0000-0000-00000000000b' and room = 'general'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'men positionen flytter sig ikke baglæns'
);

select lives_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000f3')$$,
  'Bob læser videre'
);

select is(
  (select last_read_message_id from public.chat_read_positions
    where user_id = '00000000-0000-0000-0000-00000000000b' and room = 'general'),
  '00000000-0000-0000-0000-0000000000f3'::uuid,
  'positionen flytter fremad'
);

select is(
  (select count(*)::int from public.chat_read_positions
    where user_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'der er én række pr. medlem pr. rum, ikke én pr. besked'
);

select throws_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000a1')$$,
  'P0002',
  null,
  'et almindeligt medlem kan ikke markere en besked i admin-rummet'
);

select throws_ok(
  $$insert into public.chat_read_positions (user_id, room, last_read_at)
    values ('00000000-0000-0000-0000-00000000000a', 'general', now())$$,
  '42501',
  null,
  'en position kan ikke skrives direkte -- og slet ikke for en anden'
);

select throws_ok(
  $$update public.chat_read_positions set last_read_at = '2020-01-01'
    where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501',
  null,
  'en position kan ikke rettes direkte'
);

-- Dina (admin) læser begge rum
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000d'); end $$;

select lives_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000a1')$$,
  'en admin kan markere en besked i admin-rummet'
);

select lives_ok(
  $$select public.mark_chat_read('00000000-0000-0000-0000-0000000000f1')$$,
  'og i det fælles rum'
);

select is(
  (select count(*)::int from public.chat_read_positions),
  3,
  'en admin ser alle positioner, også admin-rummets'
);

-- Alice ser kun det fælles rum
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select is(
  (select count(*)::int from public.chat_read_positions where room = 'general'),
  2,
  'et medlem ser alle positioner i det fælles rum'
);

select is(
  (select count(*)::int from public.chat_read_positions where room = 'admin'),
  0,
  'men ingen i admin-rummet'
);

-- Anonyme ser intet
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select count(*) from public.chat_read_positions$$,
  '42501',
  null,
  'anon har ingen adgang til læsepositionerne'
);

select * from finish();
rollback;
