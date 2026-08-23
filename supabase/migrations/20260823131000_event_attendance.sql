-- Tilmeldinger til kalenderbegivenheder. En sammensat primærnøgle forhindrer,
-- at det samme medlem kan tilmelde sig den samme begivenhed flere gange.
create table public.event_attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_attendance_user_id_idx
  on public.event_attendance (user_id);

alter table public.event_attendance enable row level security;

create policy "Authenticated can read event attendance"
  on public.event_attendance for select
  to authenticated
  using (true);

create policy "Members can join events as themselves"
  on public.event_attendance for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Members can leave their own event attendance"
  on public.event_attendance for delete
  to authenticated
  using (auth.uid() = user_id);
