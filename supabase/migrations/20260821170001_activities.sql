-- activities: offentligt indhold om klubbens aktiviteter. Vises på den offentlige
-- aktivitetsside (#10) uden krav om login.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.activities enable row level security;

create policy "Anyone can read activities"
  on public.activities for select
  to anon, authenticated
  using (true);

create policy "Admins can manage activities"
  on public.activities for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );
