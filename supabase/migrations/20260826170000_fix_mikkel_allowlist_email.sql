-- Ret stavefejlen i Mikkels invitation fra 20260826090000.
--
-- Migrationen dér skrev 'mikkelinnet@gmail.com' med ét l. Mikkels adresse er
-- 'mikkellinnet@gmail.com' (Mikkel + Linnet), så hans signup ramte
-- check_allowed_email-triggeren og blev afvist. GoTrue pakker triggerens
-- 'Email not allowed' ind i sin egen 'Database error saving new user', så det
-- eneste, han så i appen, var den generiske fejlbesked -- ikke et hint om, at
-- adressen ikke stod på listen. Se også authErrors.ts.
insert into public.allowed_emails (email, note, is_admin)
values ('mikkellinnet@gmail.com', 'Administrator', true)
on conflict (email) do update
set is_admin = true;

update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) = 'mikkellinnet@gmail.com'
  and not p.is_admin;

-- Den forkerte adresse er ikke bare ubrugt: den er en gyldig Gmail-adresse,
-- som en helt anden person kan eje, og den står på allowlisten med
-- is_admin = true. Så længe den bliver stående, kan dens ejer oprette en
-- bruger og lande direkte i admin-panelet. Den var aldrig inviteret, så den
-- fjernes igen -- og har nogen allerede nået at bruge den, fratages
-- adminrollen. Klubben har flere andre admins, så ingen låses ude.
update public.profiles p
set is_admin = false
from auth.users u
where u.id = p.id
  and lower(u.email) = 'mikkelinnet@gmail.com'
  and p.is_admin;

delete from public.allowed_emails
where email = 'mikkelinnet@gmail.com';
