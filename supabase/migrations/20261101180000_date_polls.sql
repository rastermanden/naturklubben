-- Datoafstemninger for admins (#288): "hvornår kan vi?" til den næste tur
-- eller det næste møde. En admin opretter en afstemning med et navn og 2-10
-- mulige datoer, de andre admins svarer kan / kan måske / kan ikke pr. dato,
-- og til sidst vælges en dato, som kalenderens begivenhed oprettes ud fra.
--
-- Samme mønster som chattens afstemninger (#217): tabellerne kan kun læses
-- direkte (og kun af admins), al skrivning går gennem security
-- definer-RPC'er, der selv tjekker, hvem der kalder, og om afstemningen er
-- åben. Almindelige medlemmer ser intet.

create table public.date_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  -- Kontosletning nulstiller ophavet i stedet for at fjerne afstemningen, så
  -- de andres svar består (samme mønster som polls.created_by).
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  -- Den valgte dato. Fremmednøglen tilføjes nedenfor, når mulighederne findes.
  chosen_option_id uuid,
  -- Begivenheden, der blev oprettet ud fra den valgte dato. Slettes
  -- begivenheden, står afstemningen stadig som lukket med sin dato.
  event_id uuid references public.events (id) on delete set null,
  constraint date_polls_closed_fields_together check (
    (closed_at is null) = (chosen_option_id is null)
  ),
  constraint date_polls_event_requires_closed check (
    event_id is null or closed_at is not null
  )
);

create table public.date_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.date_polls (id) on delete cascade,
  -- 0-baseret i den rækkefølge, datoerne blev givet -- og grænsen på 10.
  position smallint not null check (position between 0 and 9),
  starts_at timestamptz not null,
  ends_at timestamptz,
  unique (poll_id, position),
  unique (poll_id, starts_at),
  constraint date_poll_options_end_after_start check (
    ends_at is null or ends_at >= starts_at
  )
);

alter table public.date_polls
  add constraint date_polls_chosen_option_fk
  foreign key (chosen_option_id)
  references public.date_poll_options (id)
  on delete set null;

-- Ét svar pr. admin pr. dato. Primærnøglen gør, at et nyt svar erstatter det
-- gamle i stedet for at ligge ved siden af det.
create table public.date_poll_votes (
  option_id uuid not null references public.date_poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

create index date_poll_options_poll_id_idx on public.date_poll_options (poll_id);
create index date_poll_votes_user_id_idx on public.date_poll_votes (user_id);

alter table public.date_polls enable row level security;
alter table public.date_poll_options enable row level security;
alter table public.date_poll_votes enable row level security;

-- Kun admins kan se afstemningerne. Der er bevidst ingen
-- insert/update/delete-politik: al skrivning går gennem RPC'erne nedenfor.
create policy "Admins can read date polls"
  on public.date_polls for select
  to authenticated
  using (public.is_admin());

create policy "Admins can read date poll options"
  on public.date_poll_options for select
  to authenticated
  using (public.is_admin());

-- Svarene er ikke anonyme: hele pointen er at kunne se, hvem der kan hvornår.
create policy "Admins can read date poll votes"
  on public.date_poll_votes for select
  to authenticated
  using (public.is_admin());

-- Fælles adgangstjek for RPC'erne: en logget ind admin, hvis konto ikke er
-- ved at blive slettet.
create or replace function public.assert_date_poll_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
    or not public.is_admin()
    or not public.account_accepts_writes()
  then
    raise exception using
      errcode = '42501',
      message = 'date_poll_not_authorized';
  end if;
  return actor_id;
end;
$$;

revoke all on function public.assert_date_poll_admin()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_date_poll
-- ---------------------------------------------------------------------------
-- p_options er et jsonb-array af {"starts_at": ..., "ends_at": ...|null}.
-- Returnerer den nye afstemnings id.
create or replace function public.create_date_poll(
  p_title text,
  p_description text,
  p_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.assert_date_poll_admin();
  new_poll_id uuid;
  option_count integer;
  option_item jsonb;
  option_position smallint := 0;
  option_start timestamptz;
  option_end timestamptz;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'date_poll_invalid_title';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'date_poll_invalid_options';
  end if;

  option_count := jsonb_array_length(p_options);
  if option_count < 2 or option_count > 10 then
    raise exception using
      errcode = '22023',
      message = 'date_poll_invalid_options';
  end if;

  insert into public.date_polls (title, description, created_by)
  values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    actor_id
  )
  returning id into new_poll_id;

  for option_item in select value from jsonb_array_elements(p_options) loop
    begin
      option_start := (option_item ->> 'starts_at')::timestamptz;
      option_end := nullif(option_item ->> 'ends_at', '')::timestamptz;
    exception when others then
      raise exception using
        errcode = '22023',
        message = 'date_poll_invalid_options';
    end;

    if option_start is null or (option_end is not null and option_end < option_start) then
      raise exception using
        errcode = '22023',
        message = 'date_poll_invalid_options';
    end if;

    begin
      insert into public.date_poll_options (poll_id, position, starts_at, ends_at)
      values (new_poll_id, option_position, option_start, option_end);
    exception when unique_violation then
      raise exception using
        errcode = '22023',
        message = 'date_poll_duplicate_option';
    end;

    option_position := option_position + 1;
  end loop;

  return new_poll_id;
end;
$$;

revoke all on function public.create_date_poll(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_date_poll(text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- set_date_poll_vote
-- ---------------------------------------------------------------------------
-- Ét kald dækker "svar", "skift svar" og (med p_answer = null) "fortryd svar".
-- Man kan kun svare for sig selv og kun i en åben afstemning.
create or replace function public.set_date_poll_vote(
  p_option_id uuid,
  p_answer text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.assert_date_poll_admin();
  target_poll public.date_polls%rowtype;
begin
  select poll.*
  into target_poll
  from public.date_poll_options as option
  join public.date_polls as poll on poll.id = option.poll_id
  where option.id = p_option_id
  for update of poll;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'date_poll_option_not_found';
  end if;

  if target_poll.closed_at is not null then
    raise exception using
      errcode = '22023',
      message = 'date_poll_closed';
  end if;

  if p_answer is null then
    delete from public.date_poll_votes
    where option_id = p_option_id and user_id = actor_id;
    return;
  end if;

  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception using
      errcode = '22023',
      message = 'date_poll_invalid_answer';
  end if;

  insert into public.date_poll_votes (option_id, user_id, answer)
  values (p_option_id, actor_id, p_answer)
  on conflict (option_id, user_id)
  do update set answer = excluded.answer, updated_at = now();
end;
$$;

revoke all on function public.set_date_poll_vote(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_date_poll_vote(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- close_date_poll
-- ---------------------------------------------------------------------------
-- Vælger en dato og lukker afstemningen. Enhver admin må -- det er en fælles
-- beslutning, ikke opretterens ejendom.
create or replace function public.close_date_poll(
  p_poll_id uuid,
  p_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.assert_date_poll_admin();
  target_poll public.date_polls%rowtype;
begin
  select *
  into target_poll
  from public.date_polls
  where id = p_poll_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'date_poll_not_found';
  end if;

  if target_poll.closed_at is not null then
    raise exception using
      errcode = '22023',
      message = 'date_poll_closed';
  end if;

  if not exists (
    select 1
    from public.date_poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'date_poll_option_not_in_poll';
  end if;

  update public.date_polls
  set closed_at = now(),
      closed_by = actor_id,
      chosen_option_id = p_option_id
  where id = p_poll_id;
end;
$$;

revoke all on function public.close_date_poll(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.close_date_poll(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- set_date_poll_event
-- ---------------------------------------------------------------------------
-- Husker, hvilken begivenhed der blev oprettet ud fra den valgte dato, så
-- afstemningen kan linke til den og ikke tilbyder at oprette den igen.
create or replace function public.set_date_poll_event(
  p_poll_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.assert_date_poll_admin();
  target_poll public.date_polls%rowtype;
begin
  select *
  into target_poll
  from public.date_polls
  where id = p_poll_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'date_poll_not_found';
  end if;

  if target_poll.closed_at is null then
    raise exception using
      errcode = '22023',
      message = 'date_poll_not_closed';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception using
      errcode = 'P0002',
      message = 'date_poll_event_not_found';
  end if;

  update public.date_polls
  set event_id = p_event_id
  where id = p_poll_id;
end;
$$;

revoke all on function public.set_date_poll_event(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_date_poll_event(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- delete_date_poll
-- ---------------------------------------------------------------------------
-- Fjerner en afstemning med alle datoer og svar (fx en, der blev oprettet
-- ved en fejl). En eventuel begivenhed i kalenderen røres ikke.
create or replace function public.delete_date_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.assert_date_poll_admin();
begin
  delete from public.date_polls where id = p_poll_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'date_poll_not_found';
  end if;
end;
$$;

revoke all on function public.delete_date_poll(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_date_poll(uuid)
  to authenticated;

-- Eksplicitte grants (#209). RLS afgør, at kun admins faktisk ser noget.
grant select on table public.date_polls to authenticated;
grant select on table public.date_poll_options to authenticated;
grant select on table public.date_poll_votes to authenticated;
grant delete, insert, select, update on table public.date_polls to service_role;
grant delete, insert, select, update on table public.date_poll_options to service_role;
grant delete, insert, select, update on table public.date_poll_votes to service_role;

notify pgrst, 'reload schema';
