-- events: klubbens kalenderbegivenheder. Kun for autentificerede medlemmer (#11).
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Authenticated can read events"
  on public.events for select
  to authenticated
  using (true);

create policy "Authenticated can create events"
  on public.events for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Owners can update own events"
  on public.events for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Owners can delete own events"
  on public.events for delete
  to authenticated
  using (auth.uid() = created_by);
