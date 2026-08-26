-- Badges (#159): admins bestemmer kataloget, medlemmerne indstiller hinanden,
-- to *forskellige* admins skal godkende, før en badge tildeles -- og ved
-- tildeling starter et 24-timers ur på at producere det fysiske badge.
--
-- Hele godkendelses- og tildelingsvejen går gennem security definer-RPC'er
-- (samme mønster som public.set_admin_role), ikke gennem direkte update fra
-- klienten: to-admin-reglen, "indstilleren tæller ikke med" og oprettelsen af
-- produktionsopgaven skal ske i én transaktion under én lås, ellers kan to
-- samtidige stemmer enten løbe forbi kravet eller tildele badgen to gange.

-- ---------------------------------------------------------------------------
-- badge-images: offentlig bucket, kun admins må skrive
-- ---------------------------------------------------------------------------
-- Oprettes i SQL (samme mønster som avatars i 20260822120000_avatars_bucket.sql),
-- så bucketten kommer med automatisk på både preview-branches og produktion.
--
-- Offentlig læsning, fordi badgebilledet vises på profiler og medlemslisten og
-- derfor har brug for en permanent URL frem for en udløbende signeret. Kun
-- rasterformater: en SVG i en offentlig bucket kan indeholde script, og
-- imagescript (som render-badge-print bruger) kan ikke rasterisere vektor.
-- Grænsen er 10 MB frem for avatars' 5 MB, netop fordi originalen er forlægget
-- for trykket og aldrig nedskaleres.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'badge-images',
  'badge-images',
  true,
  10 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can read badge images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'badge-images');

-- I modsætning til avatars er der ingen per-bruger mappe her: kataloget ejes af
-- admins, og et almindeligt medlem må hverken lægge en fil op eller udskifte en
-- eksisterende. Trykfilerne skrives af render-badge-print med Secret key, som
-- omgår RLS helt.
create policy "Admins can upload badge images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'badge-images' and public.is_admin());

create policy "Admins can update badge images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'badge-images' and public.is_admin())
  with check (bucket_id = 'badge-images' and public.is_admin());

create policy "Admins can delete badge images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'badge-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- badges: kataloget
-- ---------------------------------------------------------------------------
-- crop_* er pixelkoordinater *i originalen*: den kvadratiske udsnitsboks, som
-- den runde visning er indskrevet i. At gemme valget som tal frem for at
-- generere et beskåret billede betyder, at beskæringen kan justeres senere uden
-- et nyt upload, og at app og trykfil læser præcis samme værdier.
create table public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null
    check (char_length(btrim(name)) > 0 and char_length(name) <= 80),
  description text check (char_length(description) <= 2000),
  -- not null: en badge uden billede kan ikke trykkes og må derfor ikke findes.
  image_path text not null check (char_length(btrim(image_path)) > 0),
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  image_mime_type text not null
    check (image_mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  crop_x double precision not null default 0 check (crop_x >= 0),
  crop_y double precision not null default 0 check (crop_y >= 0),
  crop_size double precision not null check (crop_size > 0),
  -- Klubbens knapmaskine er ikke kendt endnu; 58 mm og 5 mm bleed er de
  -- gængse standardværdier og kan rettes pr. badge.
  diameter_mm numeric(6, 2) not null default 58
    check (diameter_mm >= 10 and diameter_mm <= 200),
  bleed_mm numeric(6, 2) not null default 5
    check (bleed_mm >= 0 and bleed_mm <= 20),
  print_path text,
  -- Samme outbox-tankegang som photos' optimeringsstatus: renderingen sker uden
  -- for transaktionen, og en fejl skal kunne ses og genforsøges i admin-panelet
  -- frem for at efterlade en badge, der ser færdig ud, men ikke kan trykkes.
  print_status text not null default 'pending'
    check (print_status in ('pending', 'rendering', 'ready', 'failed')),
  print_error text,
  print_attempts integer not null default 0,
  print_started_at timestamptz,
  print_completed_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Udsnittet skal ligge inden for originalen. Ellers ville trykfilen mangle
  -- billede i kanten, præcis dér hvor knapmaskinen folder om.
  constraint badges_crop_within_image check (
    crop_x + crop_size <= image_width and crop_y + crop_size <= image_height
  )
);

create index badges_active_idx on public.badges (is_active, name);

alter table public.badges enable row level security;

-- Alle medlemmer må se kataloget -- man skal kunne vælge en badge at indstille
-- til, og de tildelte badges vises for alle.
create policy "Members can read badges"
  on public.badges for select
  to authenticated
  using (true);

create policy "Admins can create badges"
  on public.badges for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy "Admins can update badges"
  on public.badges for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete badges"
  on public.badges for delete
  to authenticated
  using (public.is_admin());

-- print_* ejes af render-badge-print gennem de to RPC'er nedenfor. Uden
-- kolonnegrant'en kunne en admin sætte print_status = 'ready' i hånden og
-- dermed skjule, at der ikke findes en trykfil.
revoke update on table public.badges from anon, authenticated;
grant update (
  slug,
  name,
  description,
  image_path,
  image_width,
  image_height,
  image_mime_type,
  crop_x,
  crop_y,
  crop_size,
  diameter_mm,
  bleed_mm,
  is_active
) on table public.badges to authenticated;

create function public.touch_badge_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger badges_set_updated_at
  before update on public.badges
  for each row execute function public.touch_badge_updated_at();

-- Skifter billedet, beskæringen eller de fysiske mål, er den gamle trykfil
-- forkert. Statussen falder derfor tilbage til 'pending', så admin-panelet kan
-- se, at der mangler en ny rendering -- og så en badge aldrig kan se
-- trykklar ud med en forældet fil.
create function public.reset_badge_print_on_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.image_path is distinct from old.image_path
    or new.crop_x is distinct from old.crop_x
    or new.crop_y is distinct from old.crop_y
    or new.crop_size is distinct from old.crop_size
    or new.diameter_mm is distinct from old.diameter_mm
    or new.bleed_mm is distinct from old.bleed_mm then
    new.print_status = 'pending';
    new.print_path = null;
    new.print_error = null;
    new.print_completed_at = null;
  end if;
  return new;
end;
$$;

create trigger badges_reset_print
  before update on public.badges
  for each row execute function public.reset_badge_print_on_change();

-- ---------------------------------------------------------------------------
-- badge_nominations: indstillinger
-- ---------------------------------------------------------------------------
create table public.badge_nominations (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references public.badges (id) on delete cascade,
  nominee_id uuid not null references public.profiles (id) on delete cascade,
  nominated_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null
    check (char_length(btrim(reason)) > 0 and char_length(reason) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint badge_nominations_no_self_nomination
    check (nominee_id <> nominated_by),
  constraint badge_nominations_resolved_at_matches_status check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
);

-- Kun én *åben* indstilling ad gangen pr. (badge, medlem). Afviste indstillinger
-- bevares, så en badge kan indstilles igen efter en afvisning.
create unique index badge_nominations_one_open_per_badge_and_nominee
  on public.badge_nominations (badge_id, nominee_id)
  where status = 'pending';

create index badge_nominations_pending_idx
  on public.badge_nominations (status, created_at);
create index badge_nominations_nominated_by_idx
  on public.badge_nominations (nominated_by, created_at desc);

alter table public.badge_nominations enable row level security;

-- Indstillinger læses af admins (som skal stemme) og af den, der selv har
-- indstillet (som skal kunne følge sin egen indstilling). Den indstillede får
-- først noget at vide, når badgen er tildelt -- ellers ville en afvist
-- indstilling være synlig for modtageren.
create policy "Admins and nominators can read nominations"
  on public.badge_nominations for select
  to authenticated
  using (public.is_admin() or nominated_by = auth.uid());

-- Ingen direkte skrivning: nominate_member_for_badge håndhæver rate limit,
-- "ikke sig selv" og "ikke allerede tildelt", og vote_on_badge_nomination ejer
-- overgangen til approved/rejected.
revoke insert, update, delete on table public.badge_nominations
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- badge_nomination_approvals: én række pr. admin-stemme
-- ---------------------------------------------------------------------------
create table public.badge_nomination_approvals (
  id uuid primary key default gen_random_uuid(),
  nomination_id uuid not null
    references public.badge_nominations (id) on delete cascade,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('approve', 'reject')),
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  -- Én stemme pr. admin pr. indstilling. Uden den kunne den samme admin levere
  -- begge de to godkendelser, kravet handler om.
  constraint badge_nomination_approvals_one_vote_per_admin
    unique (nomination_id, admin_id)
);

create index badge_nomination_approvals_nomination_idx
  on public.badge_nomination_approvals (nomination_id);

alter table public.badge_nomination_approvals enable row level security;

create policy "Admins and nominators can read approvals"
  on public.badge_nomination_approvals for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.badge_nominations as nomination
      where nomination.id = nomination_id
        and nomination.nominated_by = auth.uid()
    )
  );

revoke insert, update, delete on table public.badge_nomination_approvals
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- member_badges: de tildelte badges
-- ---------------------------------------------------------------------------
-- nominated_by og reason kopieres med ved tildelingen. Vitrinen på profilen
-- skal vise, hvem der indstillede og hvorfor, men selve indstillingen er kun
-- læsbar for admins og indstilleren -- ellers ville en afvist indstilling til
-- et andet medlem også blive synlig.
create table public.member_badges (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references public.badges (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nomination_id uuid
    references public.badge_nominations (id) on delete set null,
  nominated_by uuid references public.profiles (id) on delete set null,
  reason text,
  awarded_at timestamptz not null default now(),
  constraint member_badges_one_per_member unique (badge_id, profile_id)
);

create index member_badges_profile_idx
  on public.member_badges (profile_id, awarded_at desc);

alter table public.member_badges enable row level security;

create policy "Members can read awarded badges"
  on public.member_badges for select
  to authenticated
  using (true);

-- Tildeling sker udelukkende i vote_on_badge_nomination. Uden denne revoke
-- kunne et medlem indsætte sin egen række og give sig selv en badge.
revoke insert, update, delete on table public.member_badges
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- badge_productions: det fysiske badge, deadline 24 timer
-- ---------------------------------------------------------------------------
create table public.badge_productions (
  id uuid primary key default gen_random_uuid(),
  member_badge_id uuid not null unique
    references public.member_badges (id) on delete cascade,
  due_at timestamptz not null,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done')),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint badge_productions_completed_at_matches_status check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create index badge_productions_open_idx
  on public.badge_productions (status, due_at);

alter table public.badge_productions enable row level security;

-- Produktionslisten er et admin-værktøj. Medlemmerne ser badgen på profilen,
-- ikke hvem der står med limpistolen.
create policy "Admins can read badge productions"
  on public.badge_productions for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on table public.badge_productions
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- nominate_member_for_badge
-- ---------------------------------------------------------------------------
-- Rate limit i stil med probation_application_rate_limits, men uden en separat
-- tabel: indstillingerne bevares i forvejen, så de er deres eget spor. Låsen er
-- pr. indstiller, så to samtidige forsøg ikke kan snige sig forbi grænsen.
create or replace function public.nominate_member_for_badge(
  p_badge_id uuid,
  p_nominee_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nominator uuid := auth.uid();
  badge public.badges%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
  recent_hour_count bigint;
  recent_day_count bigint;
  new_id uuid;
begin
  if nominator is null then
    raise exception using
      errcode = '42501', message = 'badge_nominate_not_authorized';
  end if;

  if p_badge_id is null or p_nominee_id is null then
    raise exception using
      errcode = '22004', message = 'badge_nominate_missing_input';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception using
      errcode = '22023', message = 'badge_nominate_reason_required';
  end if;

  if char_length(trimmed_reason) > 2000 then
    raise exception using
      errcode = '22001', message = 'badge_nominate_reason_too_long';
  end if;

  if p_nominee_id = nominator then
    raise exception using
      errcode = '23514', message = 'badge_nominate_self';
  end if;

  select * into badge from public.badges where id = p_badge_id;
  if not found then
    raise exception using
      errcode = 'P0002', message = 'badge_nominate_badge_not_found';
  end if;
  if not badge.is_active then
    raise exception using
      errcode = '23514', message = 'badge_nominate_badge_inactive';
  end if;

  if not exists (select 1 from public.profiles where id = p_nominee_id) then
    raise exception using
      errcode = 'P0002', message = 'badge_nominate_nominee_not_found';
  end if;

  if exists (
    select 1
    from public.member_badges
    where badge_id = p_badge_id and profile_id = p_nominee_id
  ) then
    raise exception using
      errcode = '23505', message = 'badge_nominate_already_awarded';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.nominate_member_for_badge:' || nominator::text, 0
    )
  );

  select count(*) into recent_hour_count
  from public.badge_nominations
  where nominated_by = nominator
    and created_at > now() - interval '1 hour';

  select count(*) into recent_day_count
  from public.badge_nominations
  where nominated_by = nominator
    and created_at > now() - interval '24 hours';

  if recent_hour_count >= 5 or recent_day_count >= 20 then
    raise exception using
      errcode = '53400', message = 'badge_nominate_rate_limited';
  end if;

  begin
    insert into public.badge_nominations (
      badge_id, nominee_id, nominated_by, reason
    )
    values (p_badge_id, p_nominee_id, nominator, trimmed_reason)
    returning id into new_id;
  exception
    when unique_violation then
      -- Det eneste delvist unikke indeks på tabellen dækker netop den åbne
      -- indstilling. Alt andet ville være en skemafejl og skal ikke skjules.
      raise exception using
        errcode = '23505', message = 'badge_nominate_already_pending';
  end;

  return new_id;
end;
$$;

revoke all on function public.nominate_member_for_badge(uuid, uuid, text)
  from public, anon;
grant execute on function public.nominate_member_for_badge(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- vote_on_badge_nomination
-- ---------------------------------------------------------------------------
-- Stemmerne tælles i samme transaktion som tildelingen, bag en advisory lock på
-- indstillingen *plus* `for update` på rækken. To samtidige godkendelser kan
-- derfor hverken tildele badgen to gange eller begge nå at læse "0 stemmer" og
-- løbe forbi to-admin-kravet.
create or replace function public.vote_on_badge_nomination(
  p_nomination_id uuid,
  p_vote text,
  p_comment text default null
)
returns table (
  nomination_status text,
  approvals integer,
  member_badge_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  voter uuid := auth.uid();
  nomination public.badge_nominations%rowtype;
  approve_count integer;
  awarded public.member_badges%rowtype;
  trimmed_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if voter is null then
    raise exception using
      errcode = '42501', message = 'badge_vote_not_authorized';
  end if;

  if p_vote is null or p_vote not in ('approve', 'reject') then
    raise exception using
      errcode = '22023', message = 'badge_vote_invalid_vote';
  end if;

  if trimmed_comment is not null and char_length(trimmed_comment) > 2000 then
    raise exception using
      errcode = '22001', message = 'badge_vote_comment_too_long';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.vote_on_badge_nomination:' || p_nomination_id::text, 0
    )
  );

  -- Autorisationen kontrolleres efter låsen, så en admin, der netop er
  -- nedgraderet, ikke kan gennemføre en allerede ventende stemme.
  if not coalesce(
    (select p.is_admin from public.profiles as p where p.id = voter), false
  ) then
    raise exception using
      errcode = '42501', message = 'badge_vote_not_authorized';
  end if;

  select * into nomination
  from public.badge_nominations
  where id = p_nomination_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002', message = 'badge_vote_nomination_not_found';
  end if;

  if nomination.status <> 'pending' then
    raise exception using
      errcode = '23514', message = 'badge_vote_already_resolved';
  end if;

  -- Den admin, der selv har indstillet, tæller ikke som en af de to. Så ville
  -- to-admin-kravet i praksis være ét: indstil, godkend, vent på én kollega.
  if nomination.nominated_by = voter then
    raise exception using
      errcode = '42501', message = 'badge_vote_nominator';
  end if;

  begin
    insert into public.badge_nomination_approvals (
      nomination_id, admin_id, vote, comment
    )
    values (p_nomination_id, voter, p_vote, trimmed_comment);
  exception
    when unique_violation then
      raise exception using
        errcode = '23505', message = 'badge_vote_already_voted';
  end;

  if p_vote = 'reject' then
    -- En afvisning lukker indstillingen med det samme -- der er ikke et krav om
    -- to afvisninger.
    update public.badge_nominations
    set status = 'rejected', resolved_at = now()
    where id = p_nomination_id;

    return query
      select
        'rejected'::text,
        (
          select count(*)::integer
          from public.badge_nomination_approvals
          where nomination_id = p_nomination_id and vote = 'approve'
        ),
        null::uuid;
    return;
  end if;

  select count(*)::integer into approve_count
  from public.badge_nomination_approvals
  where nomination_id = p_nomination_id and vote = 'approve';

  if approve_count < 2 then
    return query select 'pending'::text, approve_count, null::uuid;
    return;
  end if;

  update public.badge_nominations
  set status = 'approved', resolved_at = now()
  where id = p_nomination_id;

  insert into public.member_badges (
    badge_id, profile_id, nomination_id, nominated_by, reason
  )
  values (
    nomination.badge_id,
    nomination.nominee_id,
    nomination.id,
    nomination.nominated_by,
    nomination.reason
  )
  on conflict on constraint member_badges_one_per_member do nothing
  returning * into awarded;

  if awarded.id is not null then
    -- Produktionsuret starter ved tildelingen, ikke ved den første stemme.
    insert into public.badge_productions (member_badge_id, due_at)
    values (awarded.id, awarded.awarded_at + interval '24 hours');
  end if;

  return query select 'approved'::text, approve_count, awarded.id;
end;
$$;

revoke all on function public.vote_on_badge_nomination(uuid, text, text)
  from public, anon;
grant execute on function public.vote_on_badge_nomination(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Produktionsopgaver: tag opgaven / marker som produceret
-- ---------------------------------------------------------------------------
create or replace function public.claim_badge_production(p_production_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  production public.badge_productions%rowtype;
begin
  if not coalesce(
    (select p.is_admin from public.profiles as p where p.id = auth.uid()),
    false
  ) then
    raise exception using
      errcode = '42501', message = 'badge_production_not_authorized';
  end if;

  select * into production
  from public.badge_productions
  where id = p_production_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002', message = 'badge_production_not_found';
  end if;

  if production.status = 'done' then
    raise exception using
      errcode = '23514', message = 'badge_production_already_done';
  end if;

  if production.claimed_by is not null and production.claimed_by <> auth.uid()
  then
    raise exception using
      errcode = '23514', message = 'badge_production_claimed_by_other';
  end if;

  update public.badge_productions
  set claimed_by = auth.uid(), claimed_at = now(), status = 'in_progress'
  where id = p_production_id;
end;
$$;

revoke all on function public.claim_badge_production(uuid) from public, anon;
grant execute on function public.claim_badge_production(uuid) to authenticated;

create or replace function public.complete_badge_production(
  p_production_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  production public.badge_productions%rowtype;
begin
  if not coalesce(
    (select p.is_admin from public.profiles as p where p.id = auth.uid()),
    false
  ) then
    raise exception using
      errcode = '42501', message = 'badge_production_not_authorized';
  end if;

  select * into production
  from public.badge_productions
  where id = p_production_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002', message = 'badge_production_not_found';
  end if;

  if production.status = 'done' then
    raise exception using
      errcode = '23514', message = 'badge_production_already_done';
  end if;

  update public.badge_productions
  set
    status = 'done',
    completed_at = now(),
    completed_by = auth.uid(),
    claimed_by = coalesce(claimed_by, auth.uid()),
    claimed_at = coalesce(claimed_at, now())
  where id = p_production_id;
end;
$$;

revoke all on function public.complete_badge_production(uuid) from public, anon;
grant execute on function public.complete_badge_production(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Trykfilen: claim/complete, kaldes kun af render-badge-print
-- ---------------------------------------------------------------------------
-- Samme fencing som photos' optimering: claim'et øger forsøgstælleren og
-- returnerer den, og complete'et skriver kun, hvis tælleren stadig passer. En
-- rendering, der bliver overhalet af et nyere forsøg, ændrer derfor ingenting.
create or replace function public.claim_badge_print(
  p_badge_id uuid,
  p_user_id uuid
)
returns table (
  claimed_image_path text,
  claimed_attempt integer,
  claimed_crop_x double precision,
  claimed_crop_y double precision,
  claimed_crop_size double precision,
  claimed_diameter_mm numeric,
  claimed_bleed_mm numeric
)
language sql
security definer
set search_path = public
as $$
  update public.badges
  set print_status = 'rendering',
      print_attempts = print_attempts + 1,
      print_started_at = now(),
      print_completed_at = null,
      print_error = null
  where id = p_badge_id
    and coalesce(
      (select p.is_admin from public.profiles as p where p.id = p_user_id),
      false
    )
    and (
      print_status in ('pending', 'failed', 'ready')
      or (
        print_status = 'rendering'
        and (
          print_started_at is null
          or print_started_at <= now() - interval '10 minutes'
        )
      )
    )
  returning
    image_path,
    print_attempts,
    crop_x,
    crop_y,
    crop_size,
    diameter_mm,
    bleed_mm
$$;

revoke all on function public.claim_badge_print(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_badge_print(uuid, uuid) to service_role;

create or replace function public.complete_badge_print(
  p_badge_id uuid,
  p_expected_attempt integer,
  p_succeeded boolean,
  p_print_path text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.badges
  set print_status = case when p_succeeded then 'ready' else 'failed' end,
      print_path = case when p_succeeded then p_print_path else print_path end,
      print_error = case when p_succeeded then null else p_error end,
      print_completed_at = now()
  where id = p_badge_id
    and print_attempts = p_expected_attempt
    and print_status = 'rendering';

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.complete_badge_print(
  uuid, integer, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.complete_badge_print(
  uuid, integer, boolean, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- En tildelt badge slettes ikke -- den deaktiveres
-- ---------------------------------------------------------------------------
-- Uden guarden ville et `delete` cascade'e hele historikken væk: tildelingerne,
-- indstillingerne bag dem og produktionsopgaverne.
create function public.prevent_awarded_badge_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.member_badges where badge_id = old.id) then
    raise exception using
      errcode = '23503', message = 'badge_delete_awarded';
  end if;
  return old;
end;
$$;

create trigger badges_prevent_awarded_delete
  before delete on public.badges
  for each row execute function public.prevent_awarded_badge_delete();

notify pgrst, 'reload schema';
