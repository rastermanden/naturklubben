-- Afstemninger i chatten (#217): opretteren laver en afstemning på sin egen
-- besked, alle i rummet kan stemme, en ny stemme erstatter den gamle, kun
-- opretteren eller en admin kan lukke, og et ikke-medlem kan hverken se eller
-- stemme. Hele filen kører i én transaktion, der rulles tilbage, så fixtures
-- ikke lækker til de øvrige testfiler.
begin;

set local search_path = public, tests;

select plan(29);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'carol@example.com', false, '00000000-0000-0000-0000-00000000000c'
  );
  perform tests.create_member(
    'dina-admin@example.com', true, '00000000-0000-0000-0000-00000000000d'
  );

  -- Alice's afstemningsbesked er en helt almindelig besked -- ingen særlig
  -- message_type. Selve afstemningen kommer i næste skridt.
  insert into public.messages (id, user_id, content)
  values (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-00000000000a',
    'Hvor skal vi hen på lørdag?'
  );

  -- Et admin-rum-modstykke, så visningen kan måles til at følge beskedens rum.
  insert into public.messages (id, user_id, content, room)
  values (
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-00000000000d',
    'Hvilket budget vælger vi?',
    'admin'
  );
end
$$;

-- Anonyme kan hverken oprette, se eller stemme
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select public.create_poll(
      '00000000-0000-0000-0000-0000000000f1', array['Skoven', 'Stranden'])$$,
  '42501',
  null,
  'en anonym kan ikke oprette en afstemning'
);

select is(
  (select count(*)::int from public.polls),
  0,
  'anonyme ser ingen afstemninger (der er heller ingen endnu)'
);

-- Alice opretter afstemningen på sin egen besked
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$select public.create_poll(
      '00000000-0000-0000-0000-0000000000f1', array['Kun ét svar'])$$,
  '22023',
  null,
  'en afstemning med kun ét svar afvises'
);

select throws_ok(
  $$select public.create_poll(
      '00000000-0000-0000-0000-0000000000f1',
      array['A', 'B', 'C', 'D', 'E', 'F', 'G'])$$,
  '22023',
  null,
  'en afstemning med syv svar afvises'
);

select throws_ok(
  $$select public.create_poll(
      '00000000-0000-0000-0000-0000000000f1', array['Skoven', '  '])$$,
  '22023',
  null,
  'et tomt svar afvises'
);

do $$
declare
  created jsonb;
begin
  created := public.create_poll(
    '00000000-0000-0000-0000-0000000000f1',
    array['Skoven', 'Stranden', 'Byen']
  );
  -- Gemmes til senere brug i testene: option-id'erne kendes først nu.
  perform set_config(
    'tests.poll_id', created ->> 'id', false
  );
  perform set_config(
    'tests.option_skoven', created -> 'options' -> 0 ->> 'id', false
  );
  perform set_config(
    'tests.option_stranden', created -> 'options' -> 1 ->> 'id', false
  );
end
$$;

select is(
  (select count(*)::int from public.polls
    where message_id = '00000000-0000-0000-0000-0000000000f1'),
  1,
  'afstemningen blev oprettet på Alices besked'
);

select is(
  (select count(*)::int from public.poll_options
    where poll_id = current_setting('tests.poll_id')::uuid),
  3,
  'alle tre svar blev oprettet'
);

select throws_ok(
  $$select public.create_poll(
      '00000000-0000-0000-0000-0000000000f1', array['Skoven', 'Stranden'])$$,
  '23505',
  null,
  'en besked kan kun have én afstemning'
);

-- Bob er ikke opretteren og kan derfor ikke lave en afstemning på Alices besked
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select throws_ok(
  $$select public.create_poll(
      '00000000-0000-0000-0000-0000000000f2', array['500 kr', '1000 kr'])$$,
  '42501',
  null,
  'kun afsenderen kan gøre sin egen besked til en afstemning'
);

-- Bob stemmer på Skoven
select lives_ok(
  format(
    $$select public.cast_poll_vote('%s'::uuid, '%s'::uuid)$$,
    current_setting('tests.poll_id'),
    current_setting('tests.option_skoven')
  ),
  'Bob kan stemme på en afstemning i det fælles rum'
);

select is(
  (select count(*)::int from public.poll_votes
    where poll_id = current_setting('tests.poll_id')::uuid
      and user_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'Bobs stemme er registreret'
);

-- Bob fortryder og stemmer på Stranden i stedet: erstatter, lægger sig ikke ved siden af
select lives_ok(
  format(
    $$select public.cast_poll_vote('%s'::uuid, '%s'::uuid)$$,
    current_setting('tests.poll_id'),
    current_setting('tests.option_stranden')
  ),
  'Bob kan stemme om'
);

select is(
  (select count(*)::int from public.poll_votes
    where poll_id = current_setting('tests.poll_id')::uuid
      and user_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'Bob har stadig kun én stemme -- den nye erstattede den gamle'
);

select is(
  (select option_id from public.poll_votes
    where poll_id = current_setting('tests.poll_id')::uuid
      and user_id = '00000000-0000-0000-0000-00000000000b'),
  current_setting('tests.option_stranden')::uuid,
  'stemmen står nu på Stranden'
);

select throws_ok(
  format(
    $$select public.cast_poll_vote('%s'::uuid, gen_random_uuid())$$,
    current_setting('tests.poll_id')
  ),
  '22023',
  null,
  'en stemme på en svarmulighed, der ikke findes, afvises'
);

-- Kun opretteren eller en admin kan lukke afstemningen
select throws_ok(
  format(
    $$select public.close_poll('%s'::uuid)$$, current_setting('tests.poll_id')
  ),
  '42501',
  null,
  'Bob er hverken opretter eller admin og kan ikke lukke afstemningen'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  format(
    $$select public.close_poll('%s'::uuid)$$, current_setting('tests.poll_id')
  ),
  'opretteren kan lukke sin egen afstemning'
);

select is(
  (select closed_by from public.polls
    where id = current_setting('tests.poll_id')::uuid),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'closed_by peger på den, der lukkede'
);

select lives_ok(
  format(
    $$select public.close_poll('%s'::uuid)$$, current_setting('tests.poll_id')
  ),
  'at lukke en allerede lukket afstemning er en no-op, ikke en fejl'
);

-- Carol kan ikke stemme, når afstemningen er lukket
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select throws_ok(
  format(
    $$select public.cast_poll_vote('%s'::uuid, '%s'::uuid)$$,
    current_setting('tests.poll_id'),
    current_setting('tests.option_skoven')
  ),
  '55000',
  null,
  'en lukket afstemning kan ikke modtage flere stemmer'
);

-- Admin-rummets afstemning er skjult og lukket for et almindeligt medlem
do $$
declare
  admin_poll jsonb;
begin
  perform tests.login('00000000-0000-0000-0000-00000000000d');
  admin_poll := public.create_poll(
    '00000000-0000-0000-0000-0000000000f2', array['500 kr', '1000 kr']
  );
  perform set_config('tests.admin_poll_id', admin_poll ->> 'id', false);
  perform set_config(
    'tests.admin_option_id', admin_poll -> 'options' -> 0 ->> 'id', false
  );
  perform tests.login('00000000-0000-0000-0000-00000000000c');
end
$$;

select is(
  (select count(*)::int from public.polls
    where message_id = '00000000-0000-0000-0000-0000000000f2'),
  0,
  'et almindeligt medlem ser ikke en afstemning i admin-rummet'
);

select throws_ok(
  format(
    $$select public.cast_poll_vote('%s'::uuid, '%s'::uuid)$$,
    current_setting('tests.admin_poll_id'),
    current_setting('tests.admin_option_id')
  ),
  '42501',
  null,
  'et almindeligt medlem kan ikke stemme på en afstemning i admin-rummet'
);

-- Men en admin kan se, stemme og lukke den
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000d'); end $$;

select is(
  (select count(*)::int from public.polls
    where message_id = '00000000-0000-0000-0000-0000000000f2'),
  1,
  'en admin ser afstemningen i admin-rummet'
);

select lives_ok(
  format(
    $$select public.cast_poll_vote('%s'::uuid, '%s'::uuid)$$,
    current_setting('tests.admin_poll_id'),
    current_setting('tests.admin_option_id')
  ),
  'en admin kan stemme i admin-rummets afstemning'
);

select lives_ok(
  format(
    $$select public.close_poll('%s'::uuid)$$, current_setting('tests.admin_poll_id')
  ),
  'en admin kan lukke admin-rummets afstemning'
);

-- Et almindeligt medlem kan ikke lukke en admin-rums-afstemning, selv en
-- allerede lukket -- synligheden skal tjekkes før no-op'en, ikke efter.
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select throws_ok(
  format(
    $$select public.close_poll('%s'::uuid)$$, current_setting('tests.admin_poll_id')
  ),
  '42501',
  null,
  'et almindeligt medlem kan ikke lukke en allerede lukket afstemning i admin-rummet'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000d'); end $$;

-- En admin kan også lukke en andens afstemning i det fælles rum
do $$
declare
  second_poll jsonb;
begin
  perform tests.login('00000000-0000-0000-0000-00000000000b');
  insert into public.messages (id, user_id, content)
  values (
    '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000000b',
    'Hvornår mødes vi?'
  );
  second_poll := public.create_poll(
    '00000000-0000-0000-0000-0000000000f3', array['09:00', '10:00']
  );
  perform set_config('tests.second_poll_id', second_poll ->> 'id', false);
  perform tests.login('00000000-0000-0000-0000-00000000000d');
end
$$;

select lives_ok(
  format(
    $$select public.close_poll('%s'::uuid)$$, current_setting('tests.second_poll_id')
  ),
  'en admin kan lukke en andens afstemning'
);

-- Rettighederne er eksplicitte (#209): ingen kan skrive uden om RPC'erne
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$insert into public.polls (message_id, question, created_by)
    values (
      '00000000-0000-0000-0000-0000000000f3', 'Snyder mig ind', null
    )$$,
  '42501',
  null,
  'polls kan ikke skrives uden om create_poll'
);

select throws_ok(
  format(
    $$insert into public.poll_votes (poll_id, user_id, option_id)
      values ('%s'::uuid, '00000000-0000-0000-0000-00000000000a', '%s'::uuid)$$,
    current_setting('tests.poll_id'),
    current_setting('tests.option_stranden')
  ),
  '42501',
  null,
  'poll_votes kan ikke skrives uden om cast_poll_vote'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
