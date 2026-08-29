-- Naturlog (#186): alle indloggede kan læse loggen, kun observatøren kan
-- rette sit eget fund, og både observatør og admin kan slette det.
begin;

set local search_path = public, tests;

select plan(11);

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
end
$$;

select lives_ok(
  $$insert into public.observations
      (id, species, location, latitude, longitude, created_by)
    values (
      '00000000-0000-0000-0000-0000000000f1',
      'Rød glente',
      'Mols Bjerge',
      56.22,
      10.55,
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  'et medlem kan registrere en observation'
);

select throws_ok(
  $$insert into public.observations (species, created_by)
    values ('Snyd', '00000000-0000-0000-0000-00000000000b')$$,
  '42501',
  null,
  'et medlem kan ikke registrere en observation i en andens navn'
);

select throws_ok(
  $$insert into public.observations (species, created_by)
    values ('   ', '00000000-0000-0000-0000-00000000000a')$$,
  '23514',
  null,
  'arten kan ikke være tom'
);

select throws_ok(
  $$insert into public.observations (species, latitude, created_by)
    values ('Ravn', 56.0, '00000000-0000-0000-0000-00000000000a')$$,
  '23514',
  null,
  'en position kræver både bredde- og længdegrad'
);

do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select 1 from public.observations$$,
  'anonyme kan ikke læse naturloggen'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000b'); end $$;

select is(
  (select species from public.observations
    where id = '00000000-0000-0000-0000-0000000000f1'),
  'Rød glente',
  'andre medlemmer kan læse observationen'
);

-- RLS filtrerer en ikke-matchende række stille væk i stedet for at raise'e --
-- prøv, og mål bagefter at intet ændrede sig.
do $$
begin
  update public.observations
  set species = 'Overtaget'
  where id = '00000000-0000-0000-0000-0000000000f1';
  delete from public.observations
  where id = '00000000-0000-0000-0000-0000000000f1';
end
$$;

select is(
  (select species from public.observations
    where id = '00000000-0000-0000-0000-0000000000f1'),
  'Rød glente',
  'et andet medlem kan hverken rette eller slette observationen'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select lives_ok(
  $$update public.observations
    set species = 'Rød glente (2 stk.)', notes = 'Kredsede over dalen'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'observatøren kan rette sit eget fund'
);

select throws_ok(
  $$update public.observations
    set created_by = '00000000-0000-0000-0000-00000000000b'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501',
  null,
  'observatøren kan ikke skrive fundet over på en anden'
);

select cmp_ok(
  (select updated_at from public.observations
    where id = '00000000-0000-0000-0000-0000000000f1'),
  '>=',
  (select created_at from public.observations
    where id = '00000000-0000-0000-0000-0000000000f1'),
  'updated_at følger med ved rettelser'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000c'); end $$;

select lives_ok(
  $$delete from public.observations
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'en admin kan slette et andet medlems observation'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
