-- Badges (#159): kataloget ejes af admins, medlemmerne indstiller hinanden, og
-- to *forskellige* admins skal godkende, før en badge tildeles. Testene måler
-- det ved faktisk at skifte rolle og stemme -- ikke ved at læse SQL-filen.
begin;

set local search_path = public, tests;

select plan(32);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'carol@example.com', false, '00000000-0000-0000-0000-00000000000c'
  );
  perform tests.create_member(
    'dave@example.com', false, '00000000-0000-0000-0000-00000000000d'
  );
  perform tests.create_member(
    'erik@example.com', false, '00000000-0000-0000-0000-00000000000e'
  );
  perform tests.create_member(
    'admin1@example.com', true, '00000000-0000-0000-0000-000000000001'
  );
  perform tests.create_member(
    'admin2@example.com', true, '00000000-0000-0000-0000-000000000002'
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Kataloget: kun admins skriver
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$insert into public.badges (
      id, slug, name, image_path, image_width, image_height,
      image_mime_type, crop_size, created_by
    )
    values (
      '00000000-0000-0000-0000-0000000000f9', 'snydebadge', 'Snydebadge',
      'snyd/original.png', 1200, 1200, 'image/png', 1000,
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke oprette en badge'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'badge-images',
      '00000000-0000-0000-0000-0000000000f1/original.png',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'et almindeligt medlem kan ikke uploade et badgebillede'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-000000000001'); end $$;

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'badge-images',
      '00000000-0000-0000-0000-0000000000f1/original.png',
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'en admin kan uploade et badgebillede'
);

select lives_ok(
  $$insert into public.badges (
      id, slug, name, image_path, image_width, image_height,
      image_mime_type, crop_x, crop_y, crop_size, created_by
    )
    values (
      '00000000-0000-0000-0000-0000000000f1', 'bonderoeven', 'Bonderøven',
      '00000000-0000-0000-0000-0000000000f1/original.png',
      1200, 1200, 'image/png', 100, 100, 1000,
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'en admin kan oprette en badge'
);

select lives_ok(
  $$insert into public.badges (
      id, slug, name, image_path, image_width, image_height,
      image_mime_type, crop_size, created_by
    )
    values (
      '00000000-0000-0000-0000-0000000000f2', 'baronen', 'Baronen',
      '00000000-0000-0000-0000-0000000000f2/original.png',
      1200, 1200, 'image/png', 1200,
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'en admin kan oprette endnu en badge'
);

-- print_* ejes af render-badge-print gennem claim/complete_badge_print. Kunne
-- en admin sætte statussen i hånden, ville en badge kunne se trykklar ud uden
-- at der findes en trykfil.
select throws_ok(
  $$update public.badges
    set print_status = 'ready'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501',
  null,
  'en admin kan ikke sætte print_status i hånden'
);

do $$ begin perform tests.logout(); end $$;

select is_empty(
  $$select 1 from public.badges$$,
  'anonyme kan ikke læse badge-kataloget'
);

-- ---------------------------------------------------------------------------
-- Indstillinger
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$select public.nominate_member_for_badge(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000a',
      'Jeg fortjener den selv'
    )$$,
  '23514',
  'badge_nominate_self',
  'man kan ikke indstille sig selv'
);

select throws_ok(
  $$insert into public.badge_nominations (
      badge_id, nominee_id, nominated_by, reason
    )
    values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000b',
      '00000000-0000-0000-0000-00000000000a',
      'Udenom RPC''en'
    )$$,
  '42501',
  null,
  'en indstilling kan ikke indsættes udenom RPC''en'
);

select lives_ok(
  $$select public.nominate_member_for_badge(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000b',
      'Bob har flest kartofler'
    )$$,
  'et medlem kan indstille et andet medlem'
);

select throws_ok(
  $$select public.nominate_member_for_badge(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-00000000000b',
      'Endnu en gang'
    )$$,
  '23505',
  'badge_nominate_already_pending',
  'samme medlem kan ikke indstilles til samme badge to gange på én gang'
);

-- ---------------------------------------------------------------------------
-- Afstemningen: to forskellige admins, og indstilleren tæller ikke med
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.vote_on_badge_nomination(
      (select id from public.badge_nominations
       where nominee_id = '00000000-0000-0000-0000-00000000000b'),
      'approve'
    )$$,
  '42501',
  'badge_vote_not_authorized',
  'et almindeligt medlem kan ikke stemme'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-000000000001'); end $$;

select lives_ok(
  $$select public.vote_on_badge_nomination(
      (select id from public.badge_nominations
       where nominee_id = '00000000-0000-0000-0000-00000000000b'),
      'approve',
      'Enig'
    )$$,
  'den første admin kan godkende'
);

select is_empty(
  $$select 1 from public.member_badges
    where profile_id = '00000000-0000-0000-0000-00000000000b'$$,
  'én godkendelse er ikke nok -- badgen er ikke tildelt endnu'
);

select throws_ok(
  $$select public.vote_on_badge_nomination(
      (select id from public.badge_nominations
       where nominee_id = '00000000-0000-0000-0000-00000000000b'),
      'approve'
    )$$,
  '23505',
  'badge_vote_already_voted',
  'den samme admin kan ikke stemme to gange'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-000000000002'); end $$;

select lives_ok(
  $$select public.vote_on_badge_nomination(
      (select id from public.badge_nominations
       where nominee_id = '00000000-0000-0000-0000-00000000000b'),
      'approve'
    )$$,
  'den anden admin godkender'
);

select is(
  (
    select count(*)::int
    from public.member_badges
    where profile_id = '00000000-0000-0000-0000-00000000000b'
      and badge_id = '00000000-0000-0000-0000-0000000000f1'
  ),
  1,
  'to godkendelser tildeler badgen'
);

select is(
  (
    select production.due_at - member_badge.awarded_at
    from public.badge_productions as production
    join public.member_badges as member_badge
      on member_badge.id = production.member_badge_id
    where member_badge.profile_id = '00000000-0000-0000-0000-00000000000b'
  ),
  interval '24 hours',
  'produktionsopgaven har deadline 24 timer efter tildelingen'
);

-- ---------------------------------------------------------------------------
-- Indstilleren kan ikke være den ene af de to godkendere
-- ---------------------------------------------------------------------------
do $$
begin
  perform tests.login('00000000-0000-0000-0000-000000000001');
  perform public.nominate_member_for_badge(
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-00000000000a',
    'Alice har den fineste hat'
  );
end
$$;

select throws_ok(
  $$select public.vote_on_badge_nomination(
      (select id from public.badge_nominations
       where badge_id = '00000000-0000-0000-0000-0000000000f2'
         and status = 'pending'),
      'approve'
    )$$,
  '42501',
  'badge_vote_nominator',
  'den admin, der selv indstillede, kan ikke godkende sin egen indstilling'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-000000000002'); end $$;

select lives_ok(
  $$select public.vote_on_badge_nomination(
      (select id from public.badge_nominations
       where badge_id = '00000000-0000-0000-0000-0000000000f2'
         and status = 'pending'),
      'reject',
      'Ikke i år'
    )$$,
  'en admin kan afvise en indstilling'
);

select is(
  (
    select status
    from public.badge_nominations
    where badge_id = '00000000-0000-0000-0000-0000000000f2'
  ),
  'rejected',
  'en enkelt afvisning lukker indstillingen med det samme'
);

-- ---------------------------------------------------------------------------
-- Tildelinger, produktion og sletning
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$insert into public.member_badges (badge_id, profile_id)
    values (
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  null,
  'et medlem kan ikke tildele sig selv en badge'
);

select is_empty(
  $$select 1 from public.badge_productions$$,
  'et almindeligt medlem kan ikke se produktionslisten'
);

select throws_ok(
  $$select public.claim_badge_production(
      (select id from public.badge_productions limit 1)
    )$$,
  '42501',
  'badge_production_not_authorized',
  'et almindeligt medlem kan ikke tage en produktionsopgave'
);

do $$ begin perform tests.login('00000000-0000-0000-0000-000000000001'); end $$;

select throws_ok(
  $$delete from public.badges
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23503',
  'badge_delete_awarded',
  'en tildelt badge kan ikke slettes -- den deaktiveres i stedet'
);

select lives_ok(
  $$update public.badges
    set is_active = false
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'en admin kan deaktivere en badge'
);

-- ---------------------------------------------------------------------------
-- Rate limit: feltet kan ikke spammes
-- ---------------------------------------------------------------------------
do $$
declare
  nominee uuid;
begin
  perform tests.login('00000000-0000-0000-0000-00000000000b');
  foreach nominee in array array[
    '00000000-0000-0000-0000-00000000000c'::uuid,
    '00000000-0000-0000-0000-00000000000d'::uuid,
    '00000000-0000-0000-0000-00000000000e'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  ]
  loop
    perform public.nominate_member_for_badge(
      '00000000-0000-0000-0000-0000000000f2', nominee, 'Fortjent'
    );
  end loop;
end
$$;

select throws_ok(
  $$select public.nominate_member_for_badge(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-00000000000a',
      'Nummer seks inden for en time'
    )$$,
  '53400',
  'badge_nominate_rate_limited',
  'indstillinger er rate limited pr. medlem'
);

-- ---------------------------------------------------------------------------
-- Trykfilen: kun render-badge-print (Secret key) ejer print-statussen
-- ---------------------------------------------------------------------------
do $$ begin perform tests.login('00000000-0000-0000-0000-000000000001'); end $$;

select throws_ok(
  $$select public.claim_badge_print(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'en admin kan ikke selv claime en trykrendering -- kun Secret key kan'
);

do $$
declare
  attempt integer;
begin
  perform tests.login_service();

  -- Claim og complete skal være to sætninger: complete'ets update kan ikke se
  -- claim'ets, hvis de deler kommando-id i samme sætning.
  select claimed_attempt into attempt
  from public.claim_badge_print(
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-000000000001'
  );

  perform public.complete_badge_print(
    '00000000-0000-0000-0000-0000000000f2',
    attempt,
    true,
    '00000000-0000-0000-0000-0000000000f2/print-1.png',
    null
  );
end
$$;

select is(
  (
    select print_status
    from public.badges
    where id = '00000000-0000-0000-0000-0000000000f2'
  ),
  'ready',
  'render-badge-print kan claime og afslutte en trykrendering'
);

-- Dør renderingen undervejs (Edge-runtimen løber tør, workeren ryger), kommer
-- der aldrig et complete_badge_print. Uden en aldersgrænse ville badgen stå
-- som "Trykfilen laves..." for evigt, og et nyt forsøg blive afvist. Grænsen
-- måles her ved faktisk at claime igen -- ikke ved at læse intervallet i
-- SQL-filen.
do $$ begin perform tests.login_service(); end $$;

select isnt_empty(
  $$select claimed_attempt
    from public.claim_badge_print(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'en færdig trykfil kan claimes om -- fx efter en ny beskæring'
);

select is_empty(
  $$select claimed_attempt
    from public.claim_badge_print(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'en rendering, der lige er startet, claimes ikke af to workers på én gang'
);

-- Lad claim'et blive gammelt. print_started_at kan kun sættes af en
-- privilegeret session -- netop derfor skiftes der rolle her.
do $$
begin
  perform tests.reset_session();
  update public.badges
  set print_started_at = now() - interval '5 minutes'
  where id = '00000000-0000-0000-0000-0000000000f2';
  perform tests.login_service();
end
$$;

select isnt_empty(
  $$select claimed_attempt
    from public.claim_badge_print(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-000000000001'
    )$$,
  'en rendering, der er død undervejs, kan claimes forfra'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
