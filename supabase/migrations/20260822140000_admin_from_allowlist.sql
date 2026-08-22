-- Gør bootstrappet af den første admin uafhængigt af rækkefølgen.
--
-- 20260822130000 forfremmer klubbens ejer med en UPDATE på public.profiles.
-- Den virker kun, hvis brugeren allerede findes. Men allowed_emails har været
-- tom, siden allowlist-triggeren blev deployet, så ingen har kunnet oprette sig
-- i mellemtiden -- ejeren har måske slet ingen bruger endnu. Så ville UPDATE'en
-- ramme nul rækker, og ingen ville være admin, og panelet ville være låst for
-- alle.
--
-- Derfor kan en række på allowlisten nu markeres som admin: den bruger, der
-- senere opretter sig med den adresse, får is_admin sat med det samme.

alter table public.allowed_emails
  add column if not exists is_admin boolean not null default false;

update public.allowed_emails
set is_admin = true
where email = 'martin.martinjensen@gmail.com';

-- Samme funktion som i 20260821170000_profiles.sql, men is_admin hentes nu fra
-- allowlisten i stedet for altid at være default false.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, is_admin)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(
      (select a.is_admin from public.allowed_emails a where a.email = new.email),
      false
    )
  );
  return new;
end;
$$;
