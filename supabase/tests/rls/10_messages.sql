-- Chatbeskeder: hvem må læse, skrive og slette hvad (#14, #110).
-- Hele filen kører i én transaktion, der rulles tilbage, så fixtures ikke
-- lækker til de øvrige testfiler.
begin;

-- pgTAP kalder sine egne hjælpefunktioner ukvalificeret, så tests-skemaet skal
-- ligge i search_path. public først, så appens egne navne aldrig skygges.
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

  insert into public.messages (id, user_id, content)
  values
    (
      '00000000-0000-0000-0000-00000000ac01',
      '00000000-0000-0000-0000-00000000000a',
      'Besked fra Alice'
    ),
    (
      '00000000-0000-0000-0000-00000000bc01',
      '00000000-0000-0000-0000-00000000000b',
      'Besked fra Bob'
    );
end
$$;

-- En anonym besøgende
do $$ begin perform tests.logout(); end $$;

select is(
  (select count(*)::int from public.messages),
  0,
  'anonyme kan ikke læse chatten'
);

select throws_ok(
  $$select public.soft_delete_message('00000000-0000-0000-0000-00000000ac01')$$,
  '42501',
  null,
  'anonyme kan ikke kalde soft_delete_message'
);

-- Alice, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select is(
  (select count(*)::int from public.messages),
  2,
  'et medlem kan læse hele chatten'
);

select throws_ok(
  $$insert into public.messages (user_id, content)
    values ('00000000-0000-0000-0000-00000000000b', 'Falsk afsender')$$,
  '42501',
  null,
  'et medlem kan ikke sende en besked i en andens navn'
);

select throws_ok(
  $$insert into public.messages (user_id, content, message_type)
    values (
      '00000000-0000-0000-0000-00000000000a', 'Ugyldig type', 'ukendt'
    )$$,
  '23514',
  null,
  'message_type accepterer kun text og action'
);

select lives_ok(
  $$insert into public.messages (id, user_id, content, message_type)
    values (
      '00000000-0000-0000-0000-00000000ac02',
      '00000000-0000-0000-0000-00000000000a',
      'slår rundt med en stor ørred',
      'action'
    )$$,
  'et medlem kan sende en handlingsbesked'
);

select throws_ok(
  $$delete from public.messages
    where id = '00000000-0000-0000-0000-00000000bc01'$$,
  '42501',
  null,
  'et medlem kan ikke slette en andens besked direkte'
);

select throws_ok(
  $$update public.messages set content = 'redigeret'
    where id = '00000000-0000-0000-0000-00000000ac01'$$,
  '42501',
  null,
  'et medlem kan ikke redigere sin egen besked direkte'
);

select throws_ok(
  $$select public.soft_delete_message('00000000-0000-0000-0000-00000000bc01')$$,
  '42501',
  'message_delete_not_authorized',
  'soft_delete_message afviser en andens besked'
);

select is(
  (
    select content
    from public.messages
    where id = '00000000-0000-0000-0000-00000000bc01'
  ),
  'Besked fra Bob',
  'den afviste sletning efterlod beskeden urørt'
);

select lives_ok(
  $$select public.soft_delete_message('00000000-0000-0000-0000-00000000ac01')$$,
  'ejeren kan slette sin egen besked'
);

select results_eq(
  $$select content, deleted_at is not null, deleted_by
    from public.messages
    where id = '00000000-0000-0000-0000-00000000ac01'$$,
  $$values ('', true, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'sletningen tømmer indholdet og noterer, hvem der slettede'
);

-- En admin
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000ad'); end $$;

select lives_ok(
  $$select public.soft_delete_message('00000000-0000-0000-0000-00000000bc01')$$,
  'en admin kan slette en andens besked'
);

select is(
  (
    select deleted_by
    from public.messages
    where id = '00000000-0000-0000-0000-00000000bc01'
  ),
  '00000000-0000-0000-0000-0000000000ad'::uuid,
  'admins sletning noteres på admin, ikke på afsenderen'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
