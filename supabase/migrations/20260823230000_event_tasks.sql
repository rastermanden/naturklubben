-- Opgaveliste for begivenheder (#151): medlemmer kan tilføje opgaver til en
-- begivenhed og melde sig som ansvarlige for at løse dem.
create table public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index event_tasks_event_id_idx on public.event_tasks (event_id);

alter table public.event_tasks enable row level security;

create policy "Authenticated can read event tasks"
  on public.event_tasks for select
  to authenticated
  using (true);

create policy "Members can create event tasks"
  on public.event_tasks for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Creators can delete their own event tasks"
  on public.event_tasks for delete
  to authenticated
  using (auth.uid() = created_by);

-- At melde sig ansvarlig (eller trække sig igen) er den eneste ændring, et
-- medlem må lave efter oprettelse -- titel, begivenhed og opretter ligger
-- fast. Kolonnegrant'en indsnævrer UPDATE til assigned_to alene; policyen
-- forhindrer desuden, at man kan overtage en opgave, en anden allerede har
-- meldt sig til.
revoke update on public.event_tasks from authenticated;
grant update (assigned_to) on public.event_tasks to authenticated;

create policy "Members can claim or release an unassigned task"
  on public.event_tasks for update
  to authenticated
  using (assigned_to is null or assigned_to = auth.uid())
  with check (assigned_to is null or assigned_to = auth.uid());
