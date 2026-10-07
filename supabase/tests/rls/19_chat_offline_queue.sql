-- Offline-køen: idempotent indsendelse gennem send_chat_message (#219).
--
-- Køen giver beskeden sit eget id, og gentagelser skal derfor ramme
-- primærnøglen og ikke skabe en ny række. Testen måler det, der faktisk sker i
-- databasen: hvor mange rækker der opstår, og hvad en gentagelse svarer.
begin;

set local search_path = public, tests;

select plan(18);

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
end
$$;

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select throws_ok(
  $$select * from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c001', 'Hej', 'general'
    )$$,
  '42501',
  null,
  'anonyme kan ikke sende gennem kø-RPC''en'
);

-- Alice, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$insert into public.messages (id, user_id, content, room, written_at)
    values (
      '00000000-0000-0000-0000-00000000c000',
      '00000000-0000-0000-0000-00000000000a',
      'Direkte med et forfalsket tidsstempel',
      'general',
      now() - interval '2 days'
    )$$,
  '42501',
  null,
  'et medlem kan ikke sætte written_at ved en direkte insert uden om kø-RPC''en'
);

select results_eq(
  $$select content, user_id, room, client_written_at, inserted
    from (
      select
        content,
        user_id,
        room,
        (written_at is not null) as client_written_at,
        inserted
      from public.send_chat_message(
        '00000000-0000-0000-0000-00000000c001',
        'Skrevet i skoven',
        'general',
        null,
        'text',
        '{}',
        now() - interval '2 hours'
      )
    ) as sent$$,
  $$values ('Skrevet i skoven', '00000000-0000-0000-0000-00000000000a'::uuid,
            'general', true, true)$$,
  'et medlem kan sende en købesked, og den får afsenderens eget id'
);

select is(
  (select count(*)::int from public.messages
   where id = '00000000-0000-0000-0000-00000000c001'),
  1,
  'købeskeden ligger som én række'
);

-- Gentagelsen: samme klient-id, anden tekst. Rækken må hverken blive til to
-- eller blive overskrevet -- svaret skal pege på den, der allerede ligger der.
select results_eq(
  $$select id, content, inserted
    from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c001',
      'En anden tekst',
      'general'
    )$$,
  $$values ('00000000-0000-0000-0000-00000000c001'::uuid, 'Skrevet i skoven',
            false)$$,
  'en gentagelse opretter ingen ny række og overskriver ikke indholdet'
);

select is(
  (select count(*)::int from public.messages
   where id = '00000000-0000-0000-0000-00000000c001'),
  1,
  'der ligger stadig kun én række efter gentagelsen'
);

select is(
  (
    select (extract(epoch from (now() - written_at)) > 3600)
    from public.messages
    where id = '00000000-0000-0000-0000-00000000c001'
  ),
  true,
  'skrivetidspunktet bevares gennem gentagelsen'
);

select throws_ok(
  $$select * from public.send_chat_message(null, 'Uden id', 'general')$$,
  '22023',
  'message_send_missing_client_id',
  'RPC''en kræver et klient-id -- uden det findes der ingen gentagelse at genkende'
);

select throws_ok(
  $$select * from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c004', 'I et ukendt rum', 'hemmelig'
    )$$,
  '22023',
  'message_send_unknown_room',
  'RPC''en afviser et rum, der ikke findes'
);

-- Et ur, der står forkert, må ikke kunne skrive beskeden ind i fremtiden.
select is(
  (
    select written_at <= now()
    from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c002',
      'Fra en telefon med et ur i fremtiden',
      'general',
      null,
      'text',
      '{}',
      now() + interval '3 days'
    )
  ),
  true,
  'et skrivetidspunkt i fremtiden klippes til nu'
);

select is(
  (
    select written_at is not null
    from public.messages
    where id = '00000000-0000-0000-0000-00000000c002'
  ),
  true,
  'en købesked uden skrivetidspunkt får serverens tid'
);

-- Bob kan ikke kapre Alices klient-id: rækken er hendes, og svaret ville ellers
-- lække hendes indhold.
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select throws_ok(
  $$select * from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c001', 'Stjålet id', 'general'
    )$$,
  '23505',
  'message_send_client_id_conflict',
  'en anden kan ikke genbruge eller læse en besked gennem dens klient-id'
);

select is(
  (
    select user_id
    from public.messages
    where id = '00000000-0000-0000-0000-00000000c001'
  ),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'den afviste gentagelse efterlod beskeden hos afsenderen'
);

select results_eq(
  $$select user_id, inserted
    from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c003', 'Også fra Bob', 'general'
    )$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid, true)$$,
  'RPC''en sætter altid afsenderen til den, der kalder -- der findes ingen parameter for det'
);

-- Rumreglen fra insert-policyen skal også gælde den vej, RPC'en tager.
select throws_ok(
  $$select * from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c010', 'Ind i admin-rummet', 'admin'
    )$$,
  '42501',
  'message_send_not_authorized',
  'et almindeligt medlem kan ikke lægge en besked i admin-rummet gennem køen'
);

-- Svar på en besked, der selv ligger i køen: rækkefølgen i køen giver
-- forælderen først, og id'et er kendt på forhånd, så fremmednøglen holder.
select lives_ok(
  $$select * from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c011',
      'Svar på en købesked',
      'general',
      '00000000-0000-0000-0000-00000000c001'
    )$$,
  'en købesked må svare på en anden købesked, der endnu ikke er sendt'
);

-- En admin
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000ad'); end $$;

select results_eq(
  $$select room, inserted
    from public.send_chat_message(
      '00000000-0000-0000-0000-00000000c012', 'Fra admin', 'admin'
    )$$,
  $$values ('admin', true)$$,
  'en admin kan lægge en besked i admin-rummet gennem køen'
);

select is(
  has_function_privilege(
    'anon',
    'public.send_chat_message(uuid, text, text, uuid, text, uuid[], timestamptz)',
    'execute'
  ),
  false,
  'kun medlemmer har execute på kø-RPC''en (#209)'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
