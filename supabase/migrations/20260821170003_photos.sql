-- photos: metadata for uploadede billeder. Selve filerne ligger i Storage-buckets
-- (photos-original / photos-optimized, se storage-policies-migrationen og #12/#13).
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  optimized_path text,
  thumbnail_path text,
  caption text,
  event_id uuid references public.events (id) on delete set null,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;

create policy "Authenticated can read photos"
  on public.photos for select
  to authenticated
  using (true);

create policy "Authenticated can upload photos"
  on public.photos for insert
  to authenticated
  with check (auth.uid() = uploaded_by);

create policy "Owners can update own photos"
  on public.photos for update
  to authenticated
  using (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

create policy "Owners can delete own photos"
  on public.photos for delete
  to authenticated
  using (auth.uid() = uploaded_by);

-- Bemærk: optimize-image-edge-functionen (#13) opdaterer optimized_path/thumbnail_path
-- med Secret key, som omgår RLS -- kræver derfor ingen separat policy her.
