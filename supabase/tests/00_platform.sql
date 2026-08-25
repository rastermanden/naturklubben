-- Minimalt Supabase-platformsskema til CI.
--
-- Migrationerne i supabase/migrations/ forudsætter objekter, som Supabase selv
-- opretter uden om migrationskæden: auth-skemaet med brugertabellen og
-- auth.uid(), Storage-tabellerne, Realtime-publikationen, de to billed-buckets
-- fra #2 og de tre API-roller med deres default-privilegier på public. En tom
-- database har ingen af dem, så migrationerne kan ikke afspilles uden dette lag.
--
-- Filen er bevidst additiv: den kører mod supabase/postgres-imaget, som selv
-- leverer en del af objekterne, og opretter kun det, der mangler. Det er ikke
-- kosmetik -- imaget ejer sine egne objekter med andre roller, så en blind
-- "create or replace" ville fejle på manglende ejerskab. Filen er *ikke* en
-- migration og bliver aldrig kørt mod produktion.

-- API-rollerne med præcis de attributter, Supabase giver dem: anon og
-- authenticated er underlagt RLS, mens service_role (Secret key) omgår den.
-- Testene skifter til rollen med set role, så politikkerne håndhæves rigtigt.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon' and rolbypassrls)
  then
    alter role anon nobypassrls;
  end if;
  if exists (
    select 1 from pg_roles where rolname = 'authenticated' and rolbypassrls
  ) then
    alter role authenticated nobypassrls;
  end if;
  if exists (
    select 1 from pg_roles where rolname = 'service_role' and not rolbypassrls
  ) then
    alter role service_role bypassrls;
  end if;
end
$$;

-- Testsessionen skal kunne skifte til rollerne med set role.
do $$
begin
  execute format(
    'grant anon, authenticated, service_role to %I', current_user
  );
end
$$;

-- Supabase giver rollerne adgang til alt nyt i public via default-privilegier.
-- Uden dem ville migrationernes revoke-linjer være meningsløse, og enhver test
-- ville fejle på en manglende grant i stedet for på den politik, den måler.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Skemaerne findes måske allerede. Grants sættes altid: imaget opretter
-- storage-skemaet uden at give API-rollerne adgang (det gør storage-api ellers),
-- så en betinget grant ville springe netop den over.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- auth.users: kun de kolonner, migrationerne og deres triggere rører.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- auth.uid()/auth.role() læser den samme GUC som i produktion, så en test kan
-- skifte identitet med set_config('request.jwt.claims', ...). Findes de
-- allerede, bruges platformens egen -- den læser samme sted.
do $$
declare
  claim_readers constant jsonb := jsonb_build_object(
    'uid', 'sub', 'role', 'role', 'email', 'email'
  );
  fn text;
  claim text;
begin
  for fn, claim in select * from jsonb_each_text(claim_readers)
  loop
    if not exists (
      select 1
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'auth'
        and p.proname = fn
        and p.pronargs = 0
    ) then
      execute format(
        $fn$
          create function auth.%I()
          returns %s
          language sql
          stable
          as $body$
            select nullif(
              coalesce(
                nullif(current_setting('request.jwt.claim.%s', true), ''),
                nullif(current_setting('request.jwt.claims', true), '')::jsonb
                  ->> '%s'
              ),
              ''
            )::%s
          $body$
        $fn$,
        fn,
        case when fn = 'uid' then 'uuid' else 'text' end,
        claim,
        claim,
        case when fn = 'uid' then 'uuid' else 'text' end
      );
      execute format('grant execute on function auth.%I() to public', fn);
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $body$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb,
        '{}'::jsonb
      )
    $body$;
    grant execute on function auth.jwt() to public;
  end if;
end
$$;

-- Storage. Politikkerne i migrationerne rammer storage.objects og bruger
-- storage.foldername() til at udlede mappen (= bruger-id) af objektnavnet.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  metadata jsonb
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'storage' and p.proname = 'foldername'
  ) then
    create function storage.foldername(name text)
    returns text[]
    language plpgsql
    immutable
    as $body$
    declare
      parts text[];
    begin
      parts := string_to_array(name, '/');
      return parts[1:array_length(parts, 1) - 1];
    end
    $body$;
    grant execute on function storage.foldername(text) to public;
  end if;
end
$$;

grant select, insert, update, delete on storage.buckets
  to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects
  to anon, authenticated, service_role;

-- De to billed-buckets er oprettet manuelt i Supabase-dashboardet (#2), ikke af
-- en migration. Storage-politikkerne i migrationerne peger på dem, så uden dem
-- ville testene fejle på en manglende fremmednøgle i stedet for på en politik.
insert into storage.buckets (id, name, public)
values
  ('photos-original', 'photos-original', false),
  ('photos-optimized', 'photos-optimized', true)
on conflict (id) do nothing;

-- Realtime-publikationen, som chat- og galleri-migrationerne udvider.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

-- PostgREST findes ikke i CI, så 'notify pgrst, ...' i migrationerne er en
-- harmløs no-op. Ingen grund til at stubbe noget for den.
