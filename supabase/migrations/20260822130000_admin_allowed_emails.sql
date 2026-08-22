-- Admin-panel til invitationer (#7): gør public.allowed_emails læs- og skrivbar
-- direkte fra klienten for admins, så listen over hvem der må oprette en bruger
-- kan styres i appen i stedet for i Supabase-dashboardet.

-- Ekstra felter, så panelet kan vise hvem der er inviteret, hvornår og hvorfor.
alter table public.allowed_emails
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists invited_by uuid references auth.users (id) on delete set null;

-- Hjælpefunktion: er den kaldende bruger admin? security definer, så en policy
-- kan slå op i profiles uden selv at ramme RLS på den tabel (og uden at kræve,
-- at brugeren kan læse rækken).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Kun admins må se og redigere allowlisten. Almindelige medlemmer har fortsat
-- ingen adgang -- der er bevidst ingen policy for dem.
create policy "Admins can read allowed emails"
  on public.allowed_emails for select
  to authenticated
  using (public.is_admin());

create policy "Admins can add allowed emails"
  on public.allowed_emails for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update allowed emails"
  on public.allowed_emails for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can remove allowed emails"
  on public.allowed_emails for delete
  to authenticated
  using (public.is_admin());

-- profiles-policyen "Users can update own profile" tillader en bruger at
-- opdatere hele sin egen række -- inklusive is_admin. Det var harmløst, da
-- flaget kun styrede aktivitetsindhold, men nu hvor det også giver adgang til
-- allowlisten, må ingen kunne forfremme sig selv.
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() er null for service-role og SQL-editoren (og for migrations
  -- som denne), så flaget kan stadig sættes fra Supabase-dashboardet.
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admins can change is_admin';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_admin_flag
  before update on public.profiles
  for each row execute function public.protect_admin_flag();

-- Bootstrap: uden mindst én admin kan panelet ikke bruges af nogen. Klubbens
-- ejer sættes derfor som admin her (og tilføjes til allowlisten, så hans egen
-- adresse også fremgår af listen). Skal en anden være den første admin, sættes
-- profiles.is_admin i Table Editor -- se supabase/README.md.
insert into public.allowed_emails (email, note)
values ('martin.martinjensen@gmail.com', 'Ejer af klubbens app')
on conflict (email) do nothing;

update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) = 'martin.martinjensen@gmail.com'
  and not p.is_admin;
