-- Hjertesager på profilen: man kan sætte sine egne, ikke andres, og kun de
-- mærker, appen kender.
begin;

set local search_path = public, tests;

select plan(8);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
end
$$;

select is(
  (select causes from public.profiles
    where id = '00000000-0000-0000-0000-00000000000a'),
  '{}'::text[],
  'en ny profil har ingen mærker'
);

-- Alice, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$update public.profiles set causes = '{ukraine,regnbue,vaccine}'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'et medlem kan vælge alle tre mærker'
);

select lives_ok(
  $$update public.profiles set causes = '{}'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'mærkerne kan fjernes igen'
);

select throws_ok(
  $$update public.profiles set causes = '{ukraine,ananas}'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'et ukendt mærke afvises'
);

select throws_ok(
  $$update public.profiles set causes = '{ukraine,ukraine}'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'det samme mærke to gange afvises'
);

select throws_ok(
  $$update public.profiles set causes = null
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23502',
  null,
  '"ingen mærker" er den tomme liste, ikke null'
);

-- RLS filtrerer Bobs række fra, så opdateringen rammer nul rækker.
update public.profiles set causes = '{vaccine}'
  where id = '00000000-0000-0000-0000-00000000000b';

do $$ begin perform tests.reset_session(); end $$;

select is(
  (select causes from public.profiles
    where id = '00000000-0000-0000-0000-00000000000b'),
  '{}'::text[],
  'et medlem kan ikke sætte et andet medlems mærker'
);

update public.profiles set causes = '{regnbue}'
  where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (select causes from public.profiles
    where id = '00000000-0000-0000-0000-00000000000a'),
  '{regnbue}'::text[],
  'andre medlemmer kan se ens mærker'
);

select * from finish(true);

rollback;
