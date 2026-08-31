-- #196: en begivenheds ejer kan rette sin egen begivenhed, et andet medlem
-- kan ikke, og en admin kan rette enhver begivenhed. Sletning er stadig kun
-- for ejeren.
begin;

set local search_path = public, tests;

select plan(4);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'carol@example.com', true, '00000000-0000-0000-0000-00000000000c'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');

  insert into public.events (id, title, start_at, created_by)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    'Skovtur',
    now(),
    '00000000-0000-0000-0000-00000000000a'
  );
end
$$;

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

-- RLS filtrerer en ikke-matchende række stille væk i stedet for at raise'e --
-- prøv, og mål bagefter at intet ændrede sig.
do $$
begin
  update public.events set title = 'Overtaget'
  where id = '00000000-0000-0000-0000-0000000000e1';
end
$$;

select is(
  (select title from public.events
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'Skovtur',
  'et andet medlem kan ikke rette en andens begivenhed'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$update public.events set title = 'Skovtur (flyttet)'
    where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'ejeren kan rette sin egen begivenhed'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select lives_ok(
  $$update public.events set title = 'Skovtur (rettet af admin)'
    where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'en admin kan rette en andens begivenhed'
);

select is(
  (select title from public.events
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'Skovtur (rettet af admin)',
  'admins rettelse blev gemt'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
