-- Giv Troels og Kasper adgang til admin-panelet, både som eksisterende brugere
-- og hvis de først opretter deres konti efter migrationen.
insert into public.allowed_emails (email, note, is_admin)
values
  ('troelsranum@gmail.com', 'Administrator'),
  ('kaspermoller@gmail.com', 'Administrator')
on conflict (email) do update
set is_admin = true;

update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) in ('troelsranum@gmail.com', 'kaspermoller@gmail.com')
  and not p.is_admin;
