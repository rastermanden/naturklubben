-- Chatsøgning og kontekstindlæsning må aldrig vise en slettet besked (#106, #110).
begin;

set local search_path = public, tests;

select plan(13);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );

  insert into public.messages (id, user_id, content, created_at)
  values
    (
      '00000000-0000-0000-0000-00000000ac01',
      '00000000-0000-0000-0000-00000000000a',
      'Vi mødes ved skovsøen',
      timestamptz '2026-08-01 10:00:00+00'
    ),
    (
      '00000000-0000-0000-0000-00000000ac02',
      '00000000-0000-0000-0000-00000000000a',
      'Husk kikkerten til skovsøen',
      timestamptz '2026-08-01 11:00:00+00'
    ),
    (
      '00000000-0000-0000-0000-00000000ac03',
      '00000000-0000-0000-0000-00000000000a',
      'Vi ses på lørdag',
      timestamptz '2026-08-01 12:00:00+00'
    );

  perform tests.logout();
end
$$;

select throws_ok(
  $$select * from public.search_chat_messages('skovsøen')$$,
  '42501',
  null,
  'anonyme kan ikke søge i chathistorikken'
);

select throws_ok(
  $$select * from public.get_chat_message_context(
      '00000000-0000-0000-0000-00000000ac01'
    )$$,
  '42501',
  null,
  'anonyme kan ikke hente kontekst omkring en besked'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select results_eq(
  $$select id from public.search_chat_messages('skovsøen')
    order by created_at$$,
  $$values
      ('00000000-0000-0000-0000-00000000ac01'::uuid),
      ('00000000-0000-0000-0000-00000000ac02'::uuid)$$,
  'søgningen finder begge beskeder om skovsøen'
);

select is(
  (select count(*)::int from public.search_chat_messages('   ')),
  0,
  'en tom søgning giver ingen træffere frem for hele historikken'
);

select is(
  (select count(*)::int from public.get_chat_message_context(
    '00000000-0000-0000-0000-00000000ac02'
  )),
  3,
  'konteksten omkring en besked indeholder hele samtalen'
);

-- Alice sletter sin egen besked
select lives_ok(
  $$select public.soft_delete_message('00000000-0000-0000-0000-00000000ac02')$$,
  'ejeren sletter en af beskederne'
);

select results_eq(
  $$select id from public.search_chat_messages('skovsøen')$$,
  $$values ('00000000-0000-0000-0000-00000000ac01'::uuid)$$,
  'søgningen viser ikke den slettede besked'
);

select is(
  (select count(*)::int from public.get_chat_message_context(
    '00000000-0000-0000-0000-00000000ac02'
  )),
  0,
  'der er ingen kontekst omkring en slettet besked'
);

select results_eq(
  $$select id from public.get_chat_message_context(
      '00000000-0000-0000-0000-00000000ac01'
    )$$,
  $$values
      ('00000000-0000-0000-0000-00000000ac01'::uuid),
      ('00000000-0000-0000-0000-00000000ac03'::uuid)$$,
  'den slettede besked mangler også midt i en kontekst'
);

-- Søgningen skal finde det, folk faktisk taster: ordstumper, halvskrevne
-- sætninger, stopord og tegn, der tilfældigvis er jokertegn i like (#183).
do $$
begin
  insert into public.messages (id, user_id, content, created_at)
  values
    (
      '00000000-0000-0000-0000-00000000ac04',
      '00000000-0000-0000-0000-00000000000a',
      'Martins kikkert kostede 50% mindre',
      timestamptz '2026-08-01 13:00:00+00'
    ),
    (
      '00000000-0000-0000-0000-00000000ac05',
      '00000000-0000-0000-0000-00000000000a',
      'Det bliver godt vejr på søndag',
      timestamptz '2026-08-01 14:00:00+00'
    );
end
$$;

select results_eq(
  $$select id from public.search_chat_messages('skovs')$$,
  $$values ('00000000-0000-0000-0000-00000000ac01'::uuid)$$,
  'en ordstump finder beskeden, selv om ordet ikke er skrevet færdigt'
);

select results_eq(
  $$select id from public.search_chat_messages('MØDES VED SKOVS')$$,
  $$values ('00000000-0000-0000-0000-00000000ac01'::uuid)$$,
  'en halvskrevet sætning med versaler finder stadig beskeden'
);

select results_eq(
  $$select id from public.search_chat_messages('det')$$,
  $$values ('00000000-0000-0000-0000-00000000ac05'::uuid)$$,
  'et stopord er ikke længere en søgning uden træffere'
);

select results_eq(
  $$select id from public.search_chat_messages('%')$$,
  $$values ('00000000-0000-0000-0000-00000000ac04'::uuid)$$,
  'et procenttegn søges som tekst, ikke som jokertegn'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
