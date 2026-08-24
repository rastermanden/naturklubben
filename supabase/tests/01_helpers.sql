-- pgTAP og testhjælpere. Kører efter migrationerne, aldrig mod produktion.
--
-- pgTAP lægges i sit eget skema, så dens ~1000 funktioner ikke blandes ind i
-- public og dermed ikke kan skygge for appens egne funktionsnavne.
create schema if not exists tests;
create extension if not exists pgtap with schema tests;

grant usage on schema tests to anon, authenticated, service_role;

-- Opret et medlem, som Supabase ville gøre det: en række på allowlisten og en
-- række i auth.users. Profilen dannes af handle_new_user-triggeren, præcis som
-- ved en rigtig signup -- testene skal måle den vej, ikke en genvej udenom.
create or replace function tests.create_member(
  member_email text,
  member_is_admin boolean default false,
  member_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.allowed_emails (email, is_admin)
  values (member_email::public.citext, member_is_admin)
  on conflict (email) do update set is_admin = excluded.is_admin;

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    member_id,
    member_email,
    jsonb_build_object('full_name', split_part(member_email, '@', 1))
  );

  return member_id;
end
$$;

-- Skift til en autentificeret session for det givne medlem: både rollen (så RLS
-- rent faktisk håndhæves) og de JWT-claims, auth.uid() læser.
create or replace function tests.login(member_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', member_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end
$$;

-- Edge Functionens session: Secret key giver service_role både som databaserolle
-- og som claim, og RPC'erne kigger på claim'en.
create or replace function tests.login_service()
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );
  set local role service_role;
end
$$;

-- En anonym besøgende: ingen claims, anon-rollen.
create or replace function tests.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end
$$;

-- Tilbage til testens egen (privilegerede) session, fx for at lægge fixtures op.
create or replace function tests.reset_session()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end
$$;

grant execute on function tests.create_member(text, boolean, uuid) to public;
grant execute on function tests.login(uuid) to public;
grant execute on function tests.login_service() to public;
grant execute on function tests.logout() to public;
grant execute on function tests.reset_session() to public;
