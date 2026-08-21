-- messages: gruppechat for autentificerede medlemmer (#14). Ét fælles rum til start.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Authenticated can read messages"
  on public.messages for select
  to authenticated
  using (true);

create policy "Authenticated can send messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Owners can delete own messages"
  on public.messages for delete
  to authenticated
  using (auth.uid() = user_id);

-- Live-opdateringer i chatten (#14) kræver at tabellen er del af Realtime-publikationen.
alter publication supabase_realtime add table public.messages;
