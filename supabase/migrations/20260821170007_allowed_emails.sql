-- Tabel over tilladte e-mailadresser. Kun disse kan oprette en ny bruger.
create table public.allowed_emails (
  email citext primary key
);

alter table public.allowed_emails enable row level security;

-- Kun admins kan se/redigere listen (via service-role eller Supabase Dashboard).
-- Almindelige brugere har ingen adgang.

-- Trigger: afvis signup hvis e-mail ikke er på allowlisten.
create function public.check_allowed_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where email = new.email
  ) then
    raise exception 'Email not allowed';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_before_create
  before insert on auth.users
  for each row execute function public.check_allowed_email();
