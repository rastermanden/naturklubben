-- Adminroller må kun ændres gennem RPC'en nedenfor. Den tidligere trigger tillod
-- en admin at ændre sin egen rolle direkte og kunne derfor omgå sidste-admin-reglen.
drop trigger if exists profiles_protect_admin_flag on public.profiles;
drop function if exists public.protect_admin_flag();

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, chat_color)
  on table public.profiles
  to authenticated;

-- Allowlistens is_admin bruges fortsat til at bootstrappe en admin ved signup,
-- men må ikke kunne sættes gennem en håndskrevet klient-request.
revoke insert, update on table public.allowed_emails from anon, authenticated;
grant insert (email, note, invited_by)
  on table public.allowed_emails
  to authenticated;

create table public.admin_role_changes (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  actor_name text not null,
  target_id uuid not null,
  target_name text not null,
  old_is_admin boolean not null,
  new_is_admin boolean not null,
  changed_at timestamptz not null default now(),
  constraint admin_role_changes_must_change
    check (old_is_admin is distinct from new_is_admin)
);

create index admin_role_changes_changed_at_idx
  on public.admin_role_changes (changed_at desc);

alter table public.admin_role_changes enable row level security;

revoke all on table public.admin_role_changes from anon, authenticated;
grant select on table public.admin_role_changes to authenticated;

create policy "Admins can read role changes"
  on public.admin_role_changes for select
  to authenticated
  using (public.is_admin());

create or replace function public.set_admin_role(
  target_user_id uuid,
  make_admin boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'admin_role_not_authorized';
  end if;

  if make_admin is null then
    raise exception using
      errcode = '22004',
      message = 'admin_role_invalid_value';
  end if;

  -- Alle rolleændringer bruger samme transaktionslås. Autorisationen kontrolleres
  -- først efter låsen, så en admin, der netop er nedgraderet, ikke kan fortsætte
  -- en allerede ventende ændring med forældede rettigheder.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.set_admin_role', 0)
  );

  select *
  into actor_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found or not actor_profile.is_admin then
    raise exception using
      errcode = '42501',
      message = 'admin_role_not_authorized';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'admin_role_target_not_found';
  end if;

  if target_profile.is_admin = make_admin then
    raise exception using
      errcode = '22023',
      message = 'admin_role_unchanged';
  end if;

  if not make_admin
     and not exists (
       select 1
       from public.profiles
       where is_admin
         and id <> target_user_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'admin_role_last_admin';
  end if;

  update public.profiles
  set is_admin = make_admin
  where id = target_user_id;

  -- Hold bootstrap-flaget i sync, hvis medlemmet stadig står på allowlisten.
  -- Der oprettes ikke en ny allowlist-række: rolleændring må ikke samtidig ændre,
  -- hvem der kan oprette en konto.
  update public.allowed_emails as allowed
  set is_admin = make_admin
  from auth.users as target_user
  where target_user.id = target_user_id
    and lower(allowed.email::text) = lower(target_user.email::text);

  insert into public.admin_role_changes (
    actor_id,
    actor_name,
    target_id,
    target_name,
    old_is_admin,
    new_is_admin
  )
  values (
    actor_profile.id,
    coalesce(nullif(btrim(actor_profile.full_name), ''), 'Unavngivet medlem'),
    target_profile.id,
    coalesce(nullif(btrim(target_profile.full_name), ''), 'Unavngivet medlem'),
    target_profile.is_admin,
    make_admin
  );
end;
$$;

revoke execute on function public.set_admin_role(uuid, boolean) from public;
revoke execute on function public.set_admin_role(uuid, boolean) from anon;
grant execute on function public.set_admin_role(uuid, boolean) to authenticated;
