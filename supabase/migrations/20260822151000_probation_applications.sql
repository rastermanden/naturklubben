create table public.probation_applications (
  id bigint generated always as identity primary key,
  full_name text not null check (char_length(btrim(full_name)) > 0),
  email citext not null,
  motivation text not null check (char_length(btrim(motivation)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create unique index probation_applications_one_pending_per_email
  on public.probation_applications (email)
  where status = 'pending';

alter table public.probation_applications enable row level security;

create policy "Anyone can apply for probation"
  on public.probation_applications for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

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
