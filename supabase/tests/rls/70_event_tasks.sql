-- Opgaveliste for begivenheder (#151): medlemmer kan oprette opgaver og melde
-- sig ansvarlige, men kan hverken overtage en andens opgave, ændre andet end
-- assigned_to efter oprettelse, eller slette en opgave, de ikke selv oprettede.
begin;

set local search_path = public, tests;

select plan(9);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
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

select lives_ok(
  $$insert into public.event_tasks (event_id, title, created_by)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      'Køb pølser',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  'et medlem kan oprette en opgave'
);

do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select 1 from public.event_tasks$$,
  'anonyme kan ikke læse opgavelisten'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$insert into public.event_tasks (event_id, title, created_by)
    values (
      '00000000-0000-0000-0000-0000000000e1',
      'Snyd',
      '00000000-0000-0000-0000-00000000000b'
    )$$,
  '42501',
  null,
  'et medlem kan ikke oprette en opgave i en andens navn'
);

-- Bob melder sig til Alices opgave
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select lives_ok(
  $$update public.event_tasks
    set assigned_to = '00000000-0000-0000-0000-00000000000b'
    where title = 'Køb pølser'$$,
  'et andet medlem kan melde sig til en ledig opgave'
);

select throws_ok(
  $$update public.event_tasks
    set title = 'Overtaget'
    where title = 'Køb pølser'$$,
  '42501',
  null,
  'titlen kan ikke ændres -- kolonnegrant''en tillader kun assigned_to'
);

-- RLS filtrerer en ikke-matchende række stille væk i stedet for at raise'e --
-- disse to prøver derfor et forsøg og verificerer bagefter, at intet ændrede
-- sig, frem for at forvente en exception.
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

do $$
begin
  update public.event_tasks
  set assigned_to = '00000000-0000-0000-0000-00000000000a'
  where title = 'Køb pølser';
end
$$;

select is(
  (select assigned_to from public.event_tasks where title = 'Køb pølser'),
  '00000000-0000-0000-0000-00000000000b'::uuid,
  'et medlem kan ikke overtage en opgave, en anden allerede har meldt sig til'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

do $$
begin
  delete from public.event_tasks where title = 'Køb pølser';
end
$$;

select is(
  (select count(*)::int from public.event_tasks where title = 'Køb pølser'),
  1,
  'kun opgavens opretter kan slette den'
);

select lives_ok(
  $$update public.event_tasks
    set assigned_to = null
    where title = 'Køb pølser'$$,
  'et medlem kan trække sig fra sin egen opgave igen'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$delete from public.event_tasks where title = 'Køb pølser'$$,
  'opretteren kan slette sin egen opgave'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
