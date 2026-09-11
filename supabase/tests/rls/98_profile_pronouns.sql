-- Pronominer på profilen: man kan sætte sine egne, ikke andres, og teksten
-- skal være kort og ren.
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
end
$$;

select is(
  (select pronouns from public.profiles
    where id = '00000000-0000-0000-0000-00000000000a'),
  null,
  'en ny profil har ingen pronominer -- det er dét, appen minder om'
);

-- Alice, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$update public.profiles set pronouns = 'hun/hende'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'et medlem kan sætte sine egne pronominer'
);

select lives_ok(
  $$update public.profiles set pronouns = 'hen/hen 🌿'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'pronominer er fritekst -- også noget, der ikke står på listen'
);

select lives_ok(
  $$update public.profiles set pronouns = null
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'pronominerne kan fjernes igen'
);

select throws_ok(
  $$update public.profiles set pronouns = repeat('x', 41)
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'pronominer på over 40 tegn afvises'
);

select throws_ok(
  $$update public.profiles set pronouns = ' hun/hende'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'pronominer med mellemrum i enderne afvises -- klienten trimmer, før den gemmer'
);

select throws_ok(
  $$update public.profiles set pronouns = ''
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'en tom streng afvises -- "ikke udfyldt" er null, ikke tomt'
);

-- RLS filtrerer Bobs række fra, så opdateringen rammer nul rækker i stedet for
-- at fejle. Målet er, at Bobs profil er urørt.
update public.profiles set pronouns = 'han/ham'
  where id = '00000000-0000-0000-0000-00000000000b';

do $$ begin perform tests.reset_session(); end $$;

select is(
  (select pronouns from public.profiles
    where id = '00000000-0000-0000-0000-00000000000b'),
  null,
  'et medlem kan ikke sætte et andet medlems pronominer'
);

-- Bob læser Alices
do $$ begin perform tests.reset_session(); end $$;
update public.profiles set pronouns = 'de/dem'
  where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (select pronouns from public.profiles
    where id = '00000000-0000-0000-0000-00000000000a'),
  'de/dem',
  'andre medlemmer kan læse ens pronominer, som navn og farve'
);

select * from finish(true);

rollback;
