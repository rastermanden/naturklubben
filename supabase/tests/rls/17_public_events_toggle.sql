-- En begivenhed skal kunne gøres offentlig -- eller lukkes igen -- efter den
-- er oprettet, ikke kun i selve oprettelsesflowet (#224). RLS'en for
-- opdateringer er allerede målt i 16_events.sql (kun ejer/admin kan rette);
-- her måles selve effekten af at toggle `is_public` via en UPDATE i stedet
-- for en ny INSERT: at anon får/mister adgang med det samme, uden en ny
-- række, og at et andet medlem (ikke ejer, ikke admin) ikke kan gøre det for
-- en andens begivenhed.
begin;

set local search_path = public, tests;

select plan(6);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');

  -- Oprettet privat, som i den almindelige oprettelsesflow.
  insert into public.events (id, title, start_at, created_by, is_public)
  values (
    '00000000-0000-0000-0000-0000000000e9',
    'Bestyrelsesmøde',
    now() + interval '3 days',
    '00000000-0000-0000-0000-00000000000a',
    false
  );
end
$$;

do $$ begin perform tests.logout(); end $$;

select is(
  (select count(*)::int from public.events
    where id = '00000000-0000-0000-0000-0000000000e9'),
  0,
  'anon ser ikke begivenheden, mens den er privat'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$update public.events set is_public = true
    where id = '00000000-0000-0000-0000-0000000000e9'$$,
  'ejeren kan gøre begivenheden offentlig efter oprettelsen'
);

do $$ begin perform tests.logout(); end $$;

select is(
  (select title from public.events
    where id = '00000000-0000-0000-0000-0000000000e9'),
  'Bestyrelsesmøde',
  'anon kan nu se begivenheden -- uden at der blev indsat en ny række'
);

select results_eq(
  $$select title from public.public_events
    where id = '00000000-0000-0000-0000-0000000000e9'$$,
  $$values ('Bestyrelsesmøde')$$,
  'og den optræder på den offentlige kalenderside'
);

-- Bob er hverken ejer eller admin. RLS filtrerer opdateringen stille væk --
-- prøv, og mål bagefter at intet ændrede sig (samme mønster som
-- 16_events.sql).
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

do $$
begin
  update public.events set is_public = false
  where id = '00000000-0000-0000-0000-0000000000e9';
end
$$;

do $$ begin perform tests.logout(); end $$;

select is(
  (select count(*)::int from public.events
    where id = '00000000-0000-0000-0000-0000000000e9'),
  1,
  'et andet medlem kunne ikke lukke en andens offentlige begivenhed igen'
);

-- Ejeren kan også lukke den igen -- offentliggørelse er ikke en envejsdør.
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

do $$
begin
  update public.events set is_public = false
  where id = '00000000-0000-0000-0000-0000000000e9';
end
$$;

do $$ begin perform tests.logout(); end $$;

select is(
  (select count(*)::int from public.events
    where id = '00000000-0000-0000-0000-0000000000e9'),
  0,
  'ejeren kan også lukke begivenheden igen, uden at rækken slettes'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
