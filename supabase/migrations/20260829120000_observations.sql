-- Naturlog (#186): medlemmer registrerer, hvad de har set i naturen -- art,
-- sted, dato, noter, valgfri position og valgfrit billede fra galleriet.
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  species text not null
    check (char_length(btrim(species)) between 1 and 120),
  location text check (location is null or char_length(location) <= 200),
  observed_on date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 2000),
  latitude double precision
    check (latitude is null or latitude between -90 and 90),
  longitude double precision
    check (longitude is null or longitude between -180 and 180),
  photo_id uuid references public.photos (id) on delete set null,
  -- Observationer er klubbens historie, ikke personlige data: bliver
  -- observatøren slettet, bliver fundet stående uden navn -- som
  -- begivenheder og beskeder (se 20260823170000_account_deletion.sql).
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint observations_position_complete
    check ((latitude is null) = (longitude is null))
);

create index observations_observed_on_idx
  on public.observations (observed_on desc, created_at desc);

create index observations_created_by_idx on public.observations (created_by);

create index observations_photo_id_idx on public.observations (photo_id);

alter table public.observations enable row level security;

create policy "Authenticated can read observations"
  on public.observations for select
  to authenticated
  using (true);

create policy "Members can create their own observations"
  on public.observations for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Observers can update their own observations"
  on public.observations for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- Admins kan slette alt som moderation -- på samme vilkår som i galleriet.
create policy "Observers and admins can delete observations"
  on public.observations for delete
  to authenticated
  using (auth.uid() = created_by or public.is_admin());

-- Ejeren må rette alt om fundet, men ikke skrive det over på en anden eller
-- pille ved tidsstemplerne. Kolonnegrant'en holder UPDATE til indholdet.
revoke update on public.observations from authenticated;
grant update (species, location, observed_on, notes, latitude, longitude, photo_id)
  on public.observations to authenticated;

create or replace function public.set_observation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger observations_set_updated_at
  before update on public.observations
  for each row
  execute function public.set_observation_updated_at();
