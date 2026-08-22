-- Ansøgninger om prøvemedlemskab (#7-flow: hvem må oprette en bruger).
--
-- Filen hed oprindeligt 20260822151000_probation_applications.sql -- samme
-- versionsnummer som 20260822151000_update_seed_activities.sql, der blev
-- merget først. `supabase db push` sporer anvendte migrations på
-- versionsnummeret alene (primærnøgle i supabase_migrations.schema_migrations),
-- så da denne fil landede på main, var versionen allerede registreret, og
-- migrationen blev sprunget over uden fejl. Tabellen blev derfor aldrig
-- oprettet i produktion, og admin-panelet fik "Ansøgningerne kunne ikke
-- hentes", fordi PostgREST ikke kunne finde tabellen.
--
-- Derfor er versionsnummeret unikt nu, og hele filen er skrevet idempotent, så
-- den også kan køre i et miljø (fx en preview-database), hvor den gamle version
-- nåede at blive anvendt.

create table if not exists public.probation_applications (
  id bigint generated always as identity primary key,
  full_name text not null check (char_length(btrim(full_name)) > 0),
  email citext not null,
  motivation text not null check (char_length(btrim(motivation)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create unique index if not exists probation_applications_one_pending_per_email
  on public.probation_applications (email)
  where status = 'pending';

alter table public.probation_applications enable row level security;

create or replace function public.prevent_probation_application_for_allowed_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1
    from public.allowed_emails
    where email = new.email
  ) then
    raise exception 'Email already allowed'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists probation_applications_block_allowed_email
  on public.probation_applications;

create trigger probation_applications_block_allowed_email
  before insert on public.probation_applications
  for each row execute function public.prevent_probation_application_for_allowed_email();

drop policy if exists "Anyone can apply for probation"
  on public.probation_applications;

create policy "Anyone can apply for probation"
  on public.probation_applications for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists "Admins can read probation applications"
  on public.probation_applications;

create policy "Admins can read probation applications"
  on public.probation_applications for select
  to authenticated
  using (public.is_admin());

create or replace function public.approve_probation_application(application_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  application public.probation_applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve probation applications'
      using errcode = '42501';
  end if;

  select *
    into application
  from public.probation_applications
  where id = application_id
    and status = 'pending';

  if not found then
    raise exception 'Application not found'
      using errcode = 'P0002';
  end if;

  insert into public.allowed_emails (email, note, invited_by)
  values (
    application.email,
    'Prøvemedlemskab: ' || application.full_name,
    auth.uid()
  )
  on conflict (email) do nothing;

  update public.probation_applications
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = application_id;
end;
$$;

create or replace function public.reject_probation_application(application_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject probation applications'
      using errcode = '42501';
  end if;

  update public.probation_applications
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = application_id
    and status = 'pending';

  if not found then
    raise exception 'Application not found'
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.approve_probation_application(bigint) to authenticated;
grant execute on function public.reject_probation_application(bigint) to authenticated;

-- PostgREST cacher skemaet. Uden det her signal svarer API'et videre med
-- "Could not find the table ... in the schema cache", indtil cachen udløber.
notify pgrst, 'reload schema';
