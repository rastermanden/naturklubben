-- Kontosletning og dataopbevaringspolitik (#86).
--
-- Produktbeslutning (jf. issuet): hybrid mellem fuld sletning og anonymisering.
--   * Profil, avatar, billeder, kalendertilmeldinger, push-abonnementer og en
--     eventuel plads på allowlisten/i en verserende prøvemedlemsansøgning
--     slettes permanent -- de er entydigt personlige.
--   * Begivenheder brugeren har oprettet og beskeder brugeren har skrevet
--     bevares (fælles klubhistorik), men mister referencen til brugeren, så
--     der ikke er noget stabilt id tilbage at spore. delete-account-functionen
--     (se supabase/functions/delete-account) håndterer selve kontoen og
--     Storage-oprydningen; denne migration ændrer skemaet, så databasen
--     understøtter det.

-- events.created_by og messages.user_id peger i dag på profiles med
-- "on delete cascade" -- dvs. at en brugers begivenheder/beskeder ville blive
-- slettet sammen med brugeren. Det er ikke meningen her: de skal bevares med
-- en null-reference. Constraint-navnet slås op dynamisk (robust mod en
-- eventuel omdøbning), med Postgres' standardnavn som fallback.
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'events'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'created_by';

  if fk_name is null then
    fk_name := 'events_created_by_fkey';
  end if;

  execute format('alter table public.events drop constraint if exists %I', fk_name);
end $$;

do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'messages'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'user_id';

  if fk_name is null then
    fk_name := 'messages_user_id_fkey';
  end if;

  execute format('alter table public.messages drop constraint if exists %I', fk_name);
end $$;

-- Nullability skal ændres, før den nye "on delete set null"-constraint
-- tilføjes -- ellers ville et fremtidigt kaskade-forsøg på at nulstille en
-- not-null-kolonne fejle i selve slette-transaktionen.
alter table public.events alter column created_by drop not null;
alter table public.messages alter column user_id drop not null;

alter table public.events
  add constraint events_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.messages
  add constraint messages_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

-- photos.uploaded_by, push_subscriptions.user_id og event_attendance.user_id
-- forbliver bevidst "on delete cascade" (uændret) -- de rækker er personlige
-- og skal væk sammen med kontoen, ikke bevares anonymiseret.

-- Begivenheder uden ejer (created_by er null efter kontosletning) kunne
-- ellers ikke slettes af nogen -- "Owners can update/delete own events" kræver
-- auth.uid() = created_by, hvilket aldrig er sandt for en null-kolonne. Uden
-- denne policy ville en forældreløs begivenhed være uigenkaldeligt låst fast.
-- Simplest og mest robust: admins må slette enhver begivenhed, ikke kun
-- forældreløse -- det er allerede sådan moderation fungerer andre steder i
-- appen (allowlist, ansøgninger).
drop policy if exists "Admins can delete any event" on public.events;
create policy "Admins can delete any event"
  on public.events for delete
  to authenticated
  using (public.is_admin());

-- Samme moderationsbehov gælder anonymiserede chatbeskeder: når user_id er
-- NULL, kan den tidligere ejerpolicy aldrig matche, men en admin skal stadig
-- kunne fjerne personoplysninger eller upassende indhold fra fælleshistorikken.
drop policy if exists "Admins can delete any message" on public.messages;
create policy "Admins can delete any message"
  on public.messages for delete
  to authenticated
  using (public.is_admin());

-- Ved sletning af selve auth.users-rækken skal brugerens egen plads på
-- allowlisten og en eventuel egen prøvemedlemsansøgning forsvinde permanent --
-- de er ikke koblet til profiles via fremmednøgle (allowed_emails er nøglet på
-- e-mail, ikke bruger-id), så det kræver en trigger på auth.users selv. Kører
-- i samme transaktion som selve brugersletningen, så et afbrudt kald aldrig
-- efterlader en løsrevet allowlist-/ansøgningsrække.
--
-- Måltabellernes citext-kolonner sammenlignes case-insensitivt via et
-- eksplicit cast af auth.users' varchar-værdi nedenfor. search_path er låst
-- eksplicit (SECURITY DEFINER-funktioner arver ellers kaldeflowets
-- search_path, hvilket kunne bruges til at omdirigere til en ondsindet
-- "public.allowed_emails" tidligere i stien). Begge delete-sætninger er
-- "slet-hvis-til-stede": 0 matchende rækker er ikke en fejl, så en bruger
-- uden nogen allowlist-/ansøgningsrække (det almindelige tilfælde) aldrig
-- kan blokere selve kontosletningen.
create or replace function public.cleanup_email_records_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.users.email er varchar, mens måltabellerne bruger citext. Det
  -- eksplicitte cast er nødvendigt for at vælge citext's case-insensitive
  -- lighedsoperator; uden det kan Postgres vælge text = text.
  delete from public.allowed_emails where email = old.email::citext;
  delete from public.probation_applications where email = old.email::citext;

  -- #96 kan være merget før eller efter denne migration. Auditloggen bevares
  -- som fælles sikkerhedshistorik, men både navnesnapshots og bruger-id skal
  -- anonymiseres. Dynamisk SQL gør triggeren kompatibel, også hvis tabellen
  -- først oprettes af en senere migration.
  if to_regclass('public.admin_role_changes') is not null then
    execute $audit$
      update public.admin_role_changes
      set actor_id = '00000000-0000-0000-0000-000000000000'::uuid,
          actor_name = 'Tidligere medlem'
      where actor_id = $1
    $audit$ using old.id;

    execute $audit$
      update public.admin_role_changes
      set target_id = '00000000-0000-0000-0000-000000000000'::uuid,
          target_name = 'Tidligere medlem'
      where target_id = $1
    $audit$ using old.id;
  end if;

  return old;
end;
$$;

revoke all on function public.cleanup_email_records_on_user_delete() from public;

drop trigger if exists on_auth_user_deleted on auth.users;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.cleanup_email_records_on_user_delete();

-- Sidste-admin-reservation til delete-account-functionen (#86-opfølgning).
--
-- Et rent "tæl admins nu"-RPC efterfulgt af et separat auth.admin.deleteUser
-- -kald (som sker uden om Postgres, fra Edge Function-koden) har et
-- kapløbsvindue: to administratorer kan begge læse "der er en anden admin"
-- samtidig og begge fortsætte til sletning, så klubben ender uden nogen
-- administratorer. Løsningen her er en reservation, ikke bare en tælling:
--   1. deletion_reserved_at markerer, at netop denne bruger er i gang med at
--      blive slettet -- sat *inden* Storage-oprydningen og
--      auth.admin.deleteUser, så vinduet er lukket, før noget uigenkaldeligt
--      sker.
--   2. En administrator med en (frisk) reservation tæller ikke længere som
--      en gyldig "anden administrator" for andre samtidige forsøg -- de to
--      kan derfor ikke begge bestå tjekket.
--   3. pg_advisory_xact_lock serialiserer selve tjek-og-sæt-operationen på
--      tværs af alle samtidige kald: uden den kunne to transaktioner stadig
--      begge nå at læse "der er en anden admin", før nogen af dem skriver
--      reservationen. Det er en transaktions-lock (ikke en session-lock),
--      så den frigives automatisk, når PostgREST committer kaldet her --
--      også hvis Edge Function-processen skulle dø lige efter, uden en
--      efterladt lås.
alter table public.profiles
  add column if not exists deletion_reserved_at timestamptz;

-- En bruger, hvis sletning er reserveret, må ikke selv kunne redigere sin
-- profil i mellemtiden (fx fra en anden fane) -- det ville bl.a. gøre det
-- muligt at rydde/gensætte is_admin midt i sletteflowet og dermed omgå
-- sidste-admin-tjekket. service_role (selve delete-account-functionen)
-- rammes ikke af RLS og er upåvirket af denne policy.
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (
    auth.uid() = id
    and (
      deletion_reserved_at is null
      or deletion_reserved_at < now() - interval '15 minutes'
    )
  )
  with check (
    auth.uid() = id
    and (
      deletion_reserved_at is null
      or deletion_reserved_at < now() - interval '15 minutes'
    )
  );

-- Adminroller (#96) og kontosletning deler denne triggerbeskyttelse, også hvis
-- de to migrations lander i forskellig rækkefølge. Reservation-RPC'en og
-- triggeren bruger samme advisory lock, så en nedgradering ikke kan passere på
-- et forældet admin-count, mens en anden admin er ved at blive slettet.
create or replace function public.protect_admin_invariant_during_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is not distinct from old.is_admin then
    return new;
  end if;

  -- Samme globale rækkefølge som #96: rollelock først, derefter
  -- kontosletningslock. set_admin_role tager allerede rollelocken, før den
  -- låser profilrækker; den ens rækkefølge forhindrer deadlock mellem en
  -- rolleændring og en samtidig slettereservation.
  perform pg_advisory_xact_lock(
    hashtextextended('public.set_admin_role', 0)
  );
  perform pg_advisory_xact_lock(hashtext('naturklubben.account_deletion'));

  if old.deletion_reserved_at is not null
    and old.deletion_reserved_at >= now() - interval '15 minutes' then
    raise exception 'Adminrollen kan ikke ændres under kontosletning'
      using errcode = '23514';
  end if;

  if old.is_admin
    and not new.is_admin
    and not exists (
      select 1
      from public.profiles
      where id <> old.id
        and is_admin
        and (
          deletion_reserved_at is null
          or deletion_reserved_at < now() - interval '15 minutes'
        )
    ) then
    raise exception 'Sidste administrator kan ikke nedgraderes'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_admin_invariant_during_deletion()
  from public;

drop trigger if exists profiles_protect_deletion_admin_invariant
  on public.profiles;
create trigger profiles_protect_deletion_admin_invariant
  before update of is_admin on public.profiles
  for each row execute function public.protect_admin_invariant_during_deletion();

-- #96 opretter set_admin_role() før denne migration. Erstat funktionen, så
-- rolleændringer og kontosletning tager begge advisory locks i samme rækkefølge
-- før nogen profilrække låses. Det lukker TOCTOU-vinduet mellem en nedgradering
-- og en slettereservation uden at indføre omvendt rækkelåsning.
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.set_admin_role', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('naturklubben.account_deletion')
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
         and (
           deletion_reserved_at is null
           or deletion_reserved_at < now() - interval '15 minutes'
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'admin_role_last_admin';
  end if;

  update public.profiles
  set is_admin = make_admin
  where id = target_user_id;

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

-- Reservationen skal også lukke for nye writes i andre faner. Ellers kunne en
-- upload lande efter at delete-account netop havde tømt brugerens Storage-
-- præfiks, men før auth-brugeren blev slettet, og dermed blive forældreløs.
-- Efter 15 minutter regnes en strandet reservation som udløbet, så en
-- providerfejl ikke låser kontoen permanent.
create or replace function public.account_accepts_writes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        deletion_reserved_at is null
        or deletion_reserved_at < now() - interval '15 minutes'
      )
  );
$$;

revoke all on function public.account_accepts_writes() from public;
grant execute on function public.account_accepts_writes() to authenticated;

drop policy if exists "Authenticated can create events" on public.events;
create policy "Authenticated can create events"
  on public.events for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and public.account_accepts_writes()
  );

drop policy if exists "Authenticated can upload photos" on public.photos;

drop policy if exists "Authenticated can send messages" on public.messages;
create policy "Authenticated can send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.account_accepts_writes()
  );

drop policy if exists "Members can join events as themselves"
  on public.event_attendance;
create policy "Members can join events as themselves"
  on public.event_attendance for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.account_accepts_writes()
  );

drop policy if exists "Users can create own push subscriptions"
  on public.push_subscriptions;
create policy "Users can create own push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.account_accepts_writes()
  );

drop policy if exists "Users can update own push subscriptions"
  on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions for update
  to authenticated
  using (
    auth.uid() = user_id
    and public.account_accepts_writes()
  )
  with check (
    auth.uid() = user_id
    and public.account_accepts_writes()
  );

drop policy if exists "Authenticated can upload original photos"
  on storage.objects;
create policy "Authenticated can upload original photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  );

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  );

-- #98 bruger upsert til retry af originale uploads og opretter derfor en
-- UPDATE-policy. Genskab den med samme ejer-/præfiksafgrænsning og føj
-- slettereservationen til begge sider af policyen.
drop policy if exists "Owners can update own original photos"
  on storage.objects;
create policy "Owners can update own original photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  )
  with check (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  );

-- Et server-side optimeringsjob kan omgå RLS. Triggeren lukker derfor writes
-- på photos-rækker under en frisk reservation, uanset om de kommer fra den
-- nuværende optimize-image eller #98's claim/complete-RPC'er.
create or replace function public.prevent_photo_write_during_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.profiles
    where id = new.uploaded_by
      and deletion_reserved_at is not null
      and deletion_reserved_at >= now() - interval '15 minutes'
  ) then
    raise exception 'Fotowrites er blokeret under kontosletning'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_photo_write_during_account_deletion()
  from public;

drop trigger if exists photos_block_writes_during_account_deletion
  on public.photos;
create trigger photos_block_writes_during_account_deletion
  before insert or update on public.photos
  for each row execute function public.prevent_photo_write_during_account_deletion();

-- Functionen kender selv brugerens id (fra et gyldigt access-token via
-- auth.getUser()), men skal ikke selv have lov til at læse/tælle admin-flag
-- på tværs af alle profiles -- det giver denne SECURITY DEFINER-funktion i
-- stedet, strengt afgrænset til service_role.
--
-- To lag beskyttelse med samme formål: GRANT/REVOKE nedenfor forhindrer at
-- PostgREST overhovedet ruter kaldet fra andre roller, og auth.role()-tjekket
-- i selve funktionskroppen er en eksplicit fallback, hvis en fremtidig
-- migration ved en fejl skulle udvide grants.
--
-- Tjekket køres på ny ved *hvert* kald -- også et gentaget (idempotent) kald
-- fra samme bruger, fx efter en tidligere fejlet Storage-oprydning -- i
-- stedet for at kortslutte, hvis reservationen allerede findes. En bruger,
-- der har ligget stille længe nok til, at en anden administrators
-- reservation er udløbet (RESERVATION_TTL = 15 minutter, samme
-- genforsøgsvindue som retry-probation-notifications bruger), skal ikke
-- kunne fuldføre en sletning, der i mellemtiden er blevet usikker, fordi den
-- anden administrator nåede at slette sig selv færdig. En udløbet
-- reservation tæller derfor som "tilgængelig igen" -- ikke som en spærret
-- plads -- så den administrator, der reelt stadig findes, korrekt kan
-- fungere som den anden admin for et nyt forsøg, indtil vedkommende selv
-- prøver at fuldføre sin egen (da udløbede) sletning igen.
create or replace function public.reserve_account_deletion(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.role() afspejler requestets JWT-rolle. current_user må ikke bruges i
  -- en SECURITY DEFINER-funktion, fordi den dér er funktionsejeren (postgres),
  -- ikke den kaldende PostgREST-rolle.
  if auth.role() <> 'service_role' then
    raise exception 'reserve_account_deletion må kun kaldes med service_role'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.set_admin_role', 0)
  );
  perform pg_advisory_xact_lock(hashtext('naturklubben.account_deletion'));

  if exists (
    select 1 from public.profiles where id = target_user_id and is_admin
  ) and not exists (
    select 1 from public.profiles
    where is_admin
      and id <> target_user_id
      and (
        deletion_reserved_at is null
        or deletion_reserved_at < now() - interval '15 minutes'
      )
  ) then
    raise exception 'Sidste administrator kan ikke slettes'
      using errcode = '23514';
  end if;

  update public.profiles
  set deletion_reserved_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.reserve_account_deletion(uuid) from public;
grant execute on function public.reserve_account_deletion(uuid) to service_role;

-- Dataopbevaringspolitik for prøvemedlemsansøgninger (#86): en afvist/godkendt
-- ansøgning har ikke noget formål efter et stykke tid, og en ubesvaret
-- ansøgning skal ikke ligge for evigt. Genbruger pg_cron-mønstret fra
-- retry-probation-notifications (samme migration slog extensionen til).
create or replace function public.purge_expired_probation_applications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Afgjorte ansøgninger (godkendt/afvist): 90 dage efter afgørelsen.
  delete from public.probation_applications
  where status <> 'pending'
    and reviewed_at is not null
    and reviewed_at < now() - interval '90 days';

  -- Ubesvarede ansøgninger: 12 måneder efter de blev indsendt.
  delete from public.probation_applications
  where status = 'pending'
    and created_at < now() - interval '12 months';
end;
$$;

revoke all on function public.purge_expired_probation_applications() from public;

-- cron.unschedule fejler ikke ved 0 rækker -- select-formen her (i modsætning
-- til f.eks. en `perform` med fast jobid) er samme idempotente mønster som
-- retry-probation-notifications, så migrationen også kan køre igen mod en
-- database, der allerede har jobbet.
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-probation-applications';

select cron.schedule(
  'purge-expired-probation-applications',
  '0 3 * * *',
  'select public.purge_expired_probation_applications()'
);

-- PostgREST cacher skemaet -- uden dette signal ville reserve_account_deletion
-- ikke være kaldbar via RPC, før cachen selv udløber.
notify pgrst, 'reload schema';
