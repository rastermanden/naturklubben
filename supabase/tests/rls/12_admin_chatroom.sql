-- Admin-chatrummet (#212): kun administratorer må se og skrive i det -- og
-- det gælder alt, der hænger på en besked dér: reaktioner, søgning og
-- beskedkontekst. Det fælles rum ('general') skal forblive uændret.
-- Hele filen kører i én transaktion, der rulles tilbage, så fixtures ikke
-- lækker til de øvrige testfiler.
begin;

set local search_path = public, tests;

select plan(13);

do $$
begin
  perform tests.create_member(
    'mette@example.com', false, '00000000-0000-0000-0000-00000000ac12'
  );
  perform tests.create_member(
    'kim-admin@example.com', true, '00000000-0000-0000-0000-0000000ad12'
  );

  insert into public.messages (id, user_id, content, room)
  values
    (
      '00000000-0000-0000-0000-00000000ac13',
      '00000000-0000-0000-0000-0000000ad12',
      'Fælles besked',
      'general'
    ),
    (
      '00000000-0000-0000-0000-0000000ad13',
      '00000000-0000-0000-0000-0000000ad12',
      'Admin-besked om budgettet',
      'admin'
    );
end
$$;

-- Mette, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000ac12'); end $$;

select is(
  (select count(*)::int from public.messages),
  1,
  'et almindeligt medlem ser kun den fælles besked, ikke admin-beskeden'
);

select throws_ok(
  $$insert into public.messages (user_id, content, room)
    values (
      '00000000-0000-0000-0000-00000000ac12', 'Prøver at skrive med', 'admin'
    )$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke sende en besked i admin-rummet'
);

select is(
  (
    select count(*)::int
    from public.get_chat_message_context('00000000-0000-0000-0000-0000000ad13')
  ),
  0,
  'get_chat_message_context finder ikke en admin-besked for et almindeligt medlem'
);

select is(
  (
    select count(*)::int
    from public.search_chat_messages('budgettet', p_room => 'admin')
  ),
  0,
  'search_chat_messages finder ikke i admin-rummet for et almindeligt medlem'
);

select throws_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values (
      '00000000-0000-0000-0000-0000000ad13',
      '00000000-0000-0000-0000-00000000ac12',
      '👍'
    )$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke reagere på en besked i admin-rummet'
);

-- Kim, en admin
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000ad12'); end $$;

select is(
  (select count(*)::int from public.messages),
  2,
  'en admin ser både den fælles besked og admin-beskeden'
);

select lives_ok(
  $$insert into public.messages (user_id, content, room)
    values (
      '00000000-0000-0000-0000-0000000ad12', 'Endnu en admin-besked', 'admin'
    )$$,
  'en admin kan sende en besked i admin-rummet'
);

select is(
  (
    select count(*)::int
    from public.get_chat_message_context('00000000-0000-0000-0000-0000000ad13')
  ),
  1,
  'get_chat_message_context finder admin-beskeden for en admin'
);

select is(
  (
    select count(*)::int
    from public.search_chat_messages('budgettet', p_room => 'admin')
  ),
  1,
  'search_chat_messages finder admin-beskeden for en admin'
);

select lives_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values (
      '00000000-0000-0000-0000-0000000ad13',
      '00000000-0000-0000-0000-0000000ad12',
      '👍'
    )$$,
  'en admin kan reagere på en besked i admin-rummet'
);

select is(
  (
    select count(*)::int
    from public.message_reactions
    where message_id = '00000000-0000-0000-0000-0000000ad13'
  ),
  1,
  'admin ser sin egen reaktion på admin-beskeden'
);

-- Mette igen: reaktionen på admin-beskeden må stadig ikke være synlig for
-- hende, selvom den nu findes.
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000ac12'); end $$;

select is(
  (
    select count(*)::int
    from public.message_reactions
    where message_id = '00000000-0000-0000-0000-0000000ad13'
  ),
  0,
  'et almindeligt medlem kan ikke se reaktioner på en besked i admin-rummet'
);

select is(
  (
    select count(*)::int
    from public.messages
    where room = 'general'
  ),
  1,
  'det fælles rum er uændret -- kun den oprindelige besked er der'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
