-- Aktiviteterne er offentligt indhold, som admin-panelet nu redigerer direkte
-- fra klienten. Dermed er politikken på tabellen ikke længere kun teori: den
-- er det eneste, der står mellem et almindeligt medlem og forsidens tekst.
begin;

set local search_path = public, tests;

select plan(11);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'admin1@example.com', true, '00000000-0000-0000-0000-000000000001'
  );

  insert into public.activities (id, title, description, icon, sort_order)
  values (
    '00000000-0000-0000-0000-0000000000c1',
    'Hornfisk',
    'Vi mødes om hornfisketure, grej og gode historier fra kysten.',
    'binoculars',
    1
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Læsning: alle, også dem der ikke er logget ind
-- ---------------------------------------------------------------------------
do $$ begin perform tests.logout(); end $$;

select isnt_empty(
  $$select id from public.activities
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'en besøgende uden login kan læse aktiviteterne'
);

select throws_ok(
  $$insert into public.activities (title, description)
    values ('Snydeaktivitet', 'Lagt ind af en anonym besøgende')$$,
  '42501',
  null,
  'en anonym besøgende kan ikke oprette en aktivitet'
);

-- ---------------------------------------------------------------------------
-- Et almindeligt medlem læser, men skriver ikke
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select isnt_empty(
  $$select id from public.activities
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'et medlem kan læse aktiviteterne'
);

select throws_ok(
  $$insert into public.activities (title, description)
    values ('Snydeaktivitet', 'Lagt ind af et almindeligt medlem')$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke oprette en aktivitet'
);

-- En update, RLS afviser, rammer ingen rækker frem for at fejle. Derfor måles
-- den på, at teksten står uændret bagefter.
do $$
begin
  update public.activities
  set title = 'Overtaget af et medlem'
  where id = '00000000-0000-0000-0000-0000000000c1';
end
$$;

select is(
  (
    select title from public.activities
    where id = '00000000-0000-0000-0000-0000000000c1'
  ),
  'Hornfisk',
  'et almindeligt medlems rettelse rammer ingen rækker'
);

do $$
begin
  delete from public.activities
  where id = '00000000-0000-0000-0000-0000000000c1';
end
$$;

select isnt_empty(
  $$select id from public.activities
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'et almindeligt medlem kan ikke slette en aktivitet'
);

-- ---------------------------------------------------------------------------
-- Admin: præcis det, panelet gør
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-000000000001'); end $$;

select lives_ok(
  $$insert into public.activities (id, title, description, icon, sort_order)
    values (
      '00000000-0000-0000-0000-0000000000c2',
      'Madkoordinering',
      'Vi planlægger indkøb, menuer og fordeling af madopgaver.',
      'leaf',
      2
    )$$,
  'en admin kan oprette en aktivitet'
);

-- Panelets "flyt op"/"flyt ned" skriver netop sort_order på flere rækker.
select lives_ok(
  $$update public.activities set sort_order = 1
    where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'en admin kan ændre rækkefølgen'
);

-- Formularen kræver adresse og linktekst sammen, fordi databasen gør det.
select throws_ok(
  $$update public.activities set link_url = 'https://bral.dk'
    where id = '00000000-0000-0000-0000-0000000000c2'$$,
  '23514',
  null,
  'et link uden linktekst afvises af activities_link_complete'
);

select lives_ok(
  $$update public.activities
    set link_url = 'https://bral.dk', link_label = 'Læs om valutaen'
    where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'en admin kan sætte adresse og linktekst sammen'
);

select lives_ok(
  $$delete from public.activities
    where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'en admin kan slette en aktivitet'
);

select * from finish(true);

rollback;
