-- Offentlig kalender (#224): en arrangør kan åbne en begivenhed for
-- ikke-medlemmer, som så kan se den uden login og søge om at deltage.
--
-- Tre lag:
--
-- 1. `events.is_public`. Anon-rollen kunne før læse *alle* begivenheder
--    (policy'en fra 20260823212500 sagde `using (true)`, og #209's
--    eksplicitte grants gav anon hele tabellen). Nu ser anon kun offentlige
--    rækker og kun de kolonner, der er beregnet til offentligheden -- aldrig
--    `created_by`. Det gør også iCal-feedet (`calendar_feed_events`) til det,
--    dets kommentar hele tiden har påstået: kun offentlige begivenheder (#118).
--
-- 2. `event_guest_requests`. Ansøgninger fra ikke-medlemmer: navn, e-mail,
--    evt. besked og antal personer. De må kun læses af begivenhedens arrangør
--    og admins, oprettes kun af Edge Functionen `submit-event-guest-request`
--    (service_role) gennem en rate-limitet RPC efter samme mønster som
--    prøvemedlemskaber (#87), og afgøres gennem `security definer`-RPC'er.
--    Andre medlemmer ser kun et samlet antal godkendte gæster via
--    `event_guest_counts`.
--
-- 3. Svar til ansøgeren som e-mail. Afgørelsen sætter en outbox-status på
--    rækken og køer et `pg_net`-kald til Edge Functionen
--    `event-guest-notifications`, præcis som probation-notifications; `pg_cron`
--    genkører uløste leveringer. Gæstedata slettes automatisk 30 dage efter
--    begivenheden -- se datapolitikken.

-- ---------------------------------------------------------------------------
-- 1. Offentlige begivenheder
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists is_public boolean not null default false;

create index if not exists events_public_start_at_idx
  on public.events (start_at)
  where is_public;

drop policy if exists "Anon can read public event fields" on public.events;
drop policy if exists "Anon can read public events" on public.events;
create policy "Anon can read public events"
  on public.events for select
  to anon
  using (is_public);

-- `revoke all on table` fjerner også kolonnegrants (#209 gav anon hele
-- tabellen). Herefter får anon kun de offentlige kolonner tilbage.
revoke all on table public.events from anon;
grant select (id, title, description, location, start_at, end_at, is_public)
  on table public.events
  to anon;

-- Feedet læses som anon, så RLS filtrerer allerede. Filtret gentages i selve
-- viewet, så en læser med bredere rettigheder heller ikke får private rækker.
create or replace view public.calendar_feed_events
with (security_barrier = true, security_invoker = true)
as
select
  id,
  title,
  location,
  start_at,
  end_at
from public.events
where is_public;

-- Den offentlige kalenderside. Ingen `created_by`, ingen `created_at` -- kun
-- det, klubben har valgt at vise frem.
create or replace view public.public_events
with (security_barrier = true, security_invoker = true)
as
select
  id,
  title,
  description,
  location,
  start_at,
  end_at
from public.events
where is_public;

revoke all on table public.public_events from public, anon, authenticated;
grant select on table public.public_events to anon, authenticated, service_role;

comment on view public.public_events is
  'Offentlige begivenheder til kalendersiden uden login. Ingen medlemsdata.';

-- ---------------------------------------------------------------------------
-- 2. Ansøgninger fra ikke-medlemmer
-- ---------------------------------------------------------------------------
create table if not exists public.event_guest_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 1 and 200),
  email citext not null check (char_length(email::text) between 3 and 320),
  message text check (message is null or char_length(message) <= 2000),
  party_size integer not null default 1 check (party_size between 1 and 20),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  -- Outbox for svaret til ansøgeren; samme felter som probation_applications.
  notification_token uuid not null default gen_random_uuid(),
  notification_function_url text not null,
  decision_notification_status text
    check (
      decision_notification_status is null
      or decision_notification_status in ('pending', 'sending', 'sent', 'failed')
    ),
  decision_notification_attempts integer not null default 0
    check (decision_notification_attempts >= 0),
  decision_notification_started_at timestamptz,
  decision_notification_sent_at timestamptz,
  decision_notification_error text
);

-- Én åben ansøgning pr. e-mail pr. begivenhed. "Åben" er pending eller
-- godkendt: en godkendt gæst skal ikke kunne søge igen og få en ekstra
-- plads, mens en afvist gerne må prøve igen.
create unique index if not exists event_guest_requests_one_open_per_email
  on public.event_guest_requests (event_id, email)
  where status in ('pending', 'approved');

create index if not exists event_guest_requests_event_status_idx
  on public.event_guest_requests (event_id, status);

alter table public.event_guest_requests enable row level security;

-- Arrangøren er den, der oprettede begivenheden. Hjælperen bruges både af
-- policy'en og af afgørelses-RPC'erne, så reglen kun findes ét sted.
create or replace function public.can_manage_event_guests(target_event_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.events
      where id = target_event_id
        and created_by = auth.uid()
    );
$$;

revoke all on function public.can_manage_event_guests(uuid) from public;
grant execute on function public.can_manage_event_guests(uuid)
  to authenticated, service_role;

drop policy if exists "Organisers and admins can read guest requests"
  on public.event_guest_requests;
create policy "Organisers and admins can read guest requests"
  on public.event_guest_requests for select
  to authenticated
  using (public.can_manage_event_guests(event_id));

-- Ingen insert/update/delete-policy for klientroller: ansøgninger oprettes af
-- Edge Functionen og afgøres af RPC'erne nedenfor. Token'et holdes ude af
-- kolonnelisten -- det er pg_net-kaldets legitimation, ikke UI-data.
revoke all on table public.event_guest_requests from public, anon, authenticated;
grant select (
  id, event_id, full_name, email, message, party_size, status, created_at,
  reviewed_at, reviewed_by, decision_notification_status,
  decision_notification_attempts, decision_notification_error
)
  on table public.event_guest_requests
  to authenticated;
grant delete, insert, select, update on table public.event_guest_requests
  to service_role;

-- Alle medlemmer må se, hvor mange gæster der kommer -- men ikke hvem. Viewet
-- kører som ejer (ikke security_invoker) og lægger kun tallet frem.
create or replace view public.event_guest_counts
with (security_barrier = true)
as
select
  event_id,
  sum(party_size)::integer as guest_count
from public.event_guest_requests
where status = 'approved'
group by event_id;

revoke all on table public.event_guest_counts from public, anon, authenticated;
grant select on table public.event_guest_counts to authenticated, service_role;

comment on view public.event_guest_counts is
  'Antal godkendte gæster pr. begivenhed. Selve ansøgningerne er kun for arrangør og admin.';

-- ---------------------------------------------------------------------------
-- Rate limit (samme mønster og grænser som prøvemedlemskaber, #87)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.event_guest_request_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  network_hash text not null check (network_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default clock_timestamp()
);

create index if not exists event_guest_request_attempts_ip
  on private.event_guest_request_attempts (ip_hash, attempted_at desc);
create index if not exists event_guest_request_attempts_network
  on private.event_guest_request_attempts (network_hash, attempted_at desc);
create index if not exists event_guest_request_attempts_email
  on private.event_guest_request_attempts (email_hash, attempted_at desc);
create index if not exists event_guest_request_attempts_time
  on private.event_guest_request_attempts (attempted_at desc);

revoke all on private.event_guest_request_attempts
  from public, anon, authenticated, service_role;
revoke all on sequence private.event_guest_request_attempts_id_seq
  from public, anon, authenticated, service_role;

-- Registrerer et forsøg og returnerer null, hvis det er inden for grænserne,
-- ellers antal sekunder til det tidligste tidspunkt, hvor et nyt forsøg kan
-- gå igennem. Kaldes kun fra submit-RPC'en under dens transaktionslåse.
create or replace function private.record_event_guest_request_attempt(
  exact_ip_hash text,
  client_network_hash text,
  normalized_email_hash text,
  attempt_time timestamptz
)
returns integer
language plpgsql
security definer set search_path = private
as $$
declare
  retry_at timestamptz := attempt_time;
  candidate_retry_at timestamptz;
  ip_short_count bigint;
  ip_daily_count bigint;
  email_daily_count bigint;
  network_daily_count bigint;
  global_daily_count bigint;
begin
  insert into private.event_guest_request_attempts (
    ip_hash, network_hash, email_hash, attempted_at
  )
  values (
    exact_ip_hash, client_network_hash, normalized_email_hash, attempt_time
  );

  select count(*) into ip_short_count
  from private.event_guest_request_attempts
  where ip_hash = exact_ip_hash
    and attempted_at > attempt_time - interval '15 minutes';

  select count(*) into ip_daily_count
  from private.event_guest_request_attempts
  where ip_hash = exact_ip_hash
    and attempted_at > attempt_time - interval '24 hours';

  select count(*) into email_daily_count
  from private.event_guest_request_attempts
  where email_hash = normalized_email_hash
    and attempted_at > attempt_time - interval '24 hours';

  select count(*) into network_daily_count
  from private.event_guest_request_attempts
  where network_hash = client_network_hash
    and attempted_at > attempt_time - interval '24 hours';

  select count(*) into global_daily_count
  from private.event_guest_request_attempts
  where attempted_at > attempt_time - interval '24 hours';

  if ip_short_count <= 3
    and ip_daily_count <= 10
    and email_daily_count <= 3
    and network_daily_count <= 25
    and global_daily_count <= 1000 then
    return null;
  end if;

  if ip_short_count > 3 then
    select attempted_at + interval '15 minutes' into candidate_retry_at
    from private.event_guest_request_attempts
    where ip_hash = exact_ip_hash
      and attempted_at > attempt_time - interval '15 minutes'
    order by attempted_at
    offset greatest(ip_short_count - 3, 0)
    limit 1;
    retry_at := greatest(retry_at, candidate_retry_at);
  end if;

  if ip_daily_count > 10 then
    select attempted_at + interval '24 hours' into candidate_retry_at
    from private.event_guest_request_attempts
    where ip_hash = exact_ip_hash
      and attempted_at > attempt_time - interval '24 hours'
    order by attempted_at
    offset greatest(ip_daily_count - 10, 0)
    limit 1;
    retry_at := greatest(retry_at, candidate_retry_at);
  end if;

  if email_daily_count > 3 then
    select attempted_at + interval '24 hours' into candidate_retry_at
    from private.event_guest_request_attempts
    where email_hash = normalized_email_hash
      and attempted_at > attempt_time - interval '24 hours'
    order by attempted_at
    offset greatest(email_daily_count - 3, 0)
    limit 1;
    retry_at := greatest(retry_at, candidate_retry_at);
  end if;

  if network_daily_count > 25 then
    select attempted_at + interval '24 hours' into candidate_retry_at
    from private.event_guest_request_attempts
    where network_hash = client_network_hash
      and attempted_at > attempt_time - interval '24 hours'
    order by attempted_at
    offset greatest(network_daily_count - 25, 0)
    limit 1;
    retry_at := greatest(retry_at, candidate_retry_at);
  end if;

  if global_daily_count > 1000 then
    select attempted_at + interval '24 hours' into candidate_retry_at
    from private.event_guest_request_attempts
    where attempted_at > attempt_time - interval '24 hours'
    order by attempted_at
    offset greatest(global_daily_count - 1000, 0)
    limit 1;
    retry_at := greatest(retry_at, candidate_retry_at);
  end if;

  return greatest(1, ceil(extract(epoch from retry_at - attempt_time))::integer);
end;
$$;

revoke all on function private.record_event_guest_request_attempt(
  text, text, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function private.cleanup_event_guest_request_attempts()
returns void
language sql
security definer set search_path = private
as $$
  delete from private.event_guest_request_attempts
  where attempted_at <= now() - interval '25 hours';
$$;

revoke all on function private.cleanup_event_guest_request_attempts()
  from public, anon, authenticated, service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-event-guest-request-attempts';

select cron.schedule(
  'cleanup-event-guest-request-attempts',
  '23 * * * *',
  'select private.cleanup_event_guest_request_attempts()'
);

-- ---------------------------------------------------------------------------
-- Outbox: svaret til ansøgeren
-- ---------------------------------------------------------------------------
create or replace function public.event_guest_notification_function_url()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  request_host text;
begin
  request_host := (
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'host'
  );

  if request_host is null
    or request_host !~ '^[a-z0-9-]+[.]supabase[.]co$' then
    raise exception 'Could not determine a trusted Supabase function host'
      using errcode = '55000';
  end if;

  return 'https://' || request_host || '/functions/v1/event-guest-notifications';
end;
$$;

revoke all on function public.event_guest_notification_function_url() from public;
grant execute on function public.event_guest_notification_function_url()
  to service_role;

create or replace function public.enqueue_event_guest_notification(
  function_url text,
  request_id uuid,
  notification_token uuid
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  net_request_id bigint;
begin
  if function_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/event-guest-notifications$' then
    raise exception 'Invalid event guest notification request'
      using errcode = '22023';
  end if;

  select net.http_post(
    url := function_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'requestId', request_id,
      'notificationToken', notification_token
    ),
    timeout_milliseconds := 10000
  )
  into net_request_id;

  return net_request_id;
end;
$$;

revoke all on function public.enqueue_event_guest_notification(text, uuid, uuid)
  from public;

-- ---------------------------------------------------------------------------
-- Indsendelse (kun Edge Functionen)
-- ---------------------------------------------------------------------------
create or replace function public.submit_event_guest_request_limited(
  target_event_id uuid,
  guest_full_name text,
  guest_email citext,
  guest_message text,
  guest_party_size integer,
  exact_ip_hash text,
  client_network_hash text,
  normalized_email_hash text
)
returns table (
  submission_outcome text,
  retry_after_seconds integer
)
language plpgsql
security definer set search_path = public, private
as $$
declare
  attempt_time timestamptz := clock_timestamp();
  retry_after integer;
  lock_key text;
  function_url text;
  normalized_email citext;
  trimmed_message text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can submit event guest requests'
      using errcode = '42501';
  end if;

  if target_event_id is null
    or guest_full_name is null
    or guest_email is null
    or guest_party_size is null
    or char_length(btrim(guest_full_name)) = 0
    or char_length(btrim(guest_email::text)) = 0 then
    raise exception 'Request fields are required'
      using errcode = '22023';
  end if;

  if char_length(guest_full_name) > 200
    or char_length(guest_email::text) > 320
    or char_length(coalesce(guest_message, '')) > 2000 then
    raise exception 'Request fields are too long'
      using errcode = '22001';
  end if;

  if guest_party_size < 1
    or guest_party_size > 20
    or btrim(guest_email::text)
      !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Request fields are invalid'
      using errcode = '22023';
  end if;

  if exact_ip_hash is null
    or client_network_hash is null
    or normalized_email_hash is null
    or exact_ip_hash !~ '^[0-9a-f]{64}$'
    or client_network_hash !~ '^[0-9a-f]{64}$'
    or normalized_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Rate-limit signals are invalid'
      using errcode = '22023';
  end if;

  -- Låsene tages i leksikalsk orden, så samtidige requests med overlappende
  -- signaler serialiseres uden deadlocks (samme som prøvemedlemskaber).
  for lock_key in
    select value
    from (
      values
        ('guest:global'),
        ('guest:email:' || normalized_email_hash),
        ('guest:ip:' || exact_ip_hash),
        ('guest:network:' || client_network_hash)
    ) as lock_keys(value)
    order by value
  loop
    perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));
  end loop;

  retry_after := private.record_event_guest_request_attempt(
    exact_ip_hash, client_network_hash, normalized_email_hash, attempt_time
  );

  if retry_after is not null then
    return query select 'rate_limited'::text, retry_after;
    return;
  end if;

  -- Kun offentlige, kommende begivenheder tager imod ansøgninger. Svaret
  -- afslører ikke, om begivenheden findes privat -- begge dele er "ikke åben".
  if not exists (
    select 1
    from public.events
    where id = target_event_id
      and is_public
      and coalesce(end_at, start_at) >= attempt_time
  ) then
    return query select 'event_unavailable'::text, null::integer;
    return;
  end if;

  function_url := public.event_guest_notification_function_url();
  normalized_email := lower(btrim(guest_email::text))::citext;
  trimmed_message := nullif(btrim(coalesce(guest_message, '')), '');

  begin
    insert into public.event_guest_requests (
      event_id,
      full_name,
      email,
      message,
      party_size,
      notification_function_url
    )
    values (
      target_event_id,
      btrim(guest_full_name),
      normalized_email,
      trimmed_message,
      guest_party_size,
      function_url
    );
  exception
    when unique_violation then
      -- En åben ansøgning fra samme e-mail findes allerede. Svaret er det
      -- samme som ved en ny, så formularen ikke røber, hvem der har søgt.
      if exists (
        select 1
        from public.event_guest_requests
        where event_id = target_event_id
          and email = normalized_email
          and status in ('pending', 'approved')
      ) then
        return query select 'accepted'::text, null::integer;
        return;
      end if;
      raise;
  end;

  return query select 'accepted'::text, null::integer;
end;
$$;

revoke all on function public.submit_event_guest_request_limited(
  uuid, text, citext, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_event_guest_request_limited(
  uuid, text, citext, text, integer, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Afgørelse (arrangør eller admin)
-- ---------------------------------------------------------------------------
create or replace function public.decide_event_guest_request(
  request_id uuid,
  new_status text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  guest_request public.event_guest_requests%rowtype;
begin
  if new_status not in ('approved', 'rejected') then
    raise exception 'Unknown decision'
      using errcode = '22023';
  end if;

  select *
    into guest_request
  from public.event_guest_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'Guest request not found'
      using errcode = 'P0002';
  end if;

  if not public.can_manage_event_guests(guest_request.event_id) then
    raise exception 'Only the organiser or an admin can decide guest requests'
      using errcode = '42501';
  end if;

  if guest_request.status <> 'pending' then
    raise exception 'Guest request is already decided'
      using errcode = 'P0002';
  end if;

  update public.event_guest_requests
  set status = new_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      decision_notification_status = 'pending',
      decision_notification_started_at = null,
      decision_notification_sent_at = null,
      decision_notification_error = null
  where id = request_id;

  perform public.enqueue_event_guest_notification(
    guest_request.notification_function_url,
    guest_request.id,
    guest_request.notification_token
  );
end;
$$;

revoke all on function public.decide_event_guest_request(uuid, text) from public;

create or replace function public.approve_event_guest_request(request_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  select public.decide_event_guest_request(request_id, 'approved');
$$;

create or replace function public.reject_event_guest_request(request_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  select public.decide_event_guest_request(request_id, 'rejected');
$$;

revoke all on function public.approve_event_guest_request(uuid) from public;
revoke all on function public.reject_event_guest_request(uuid) from public;
grant execute on function public.approve_event_guest_request(uuid)
  to authenticated, service_role;
grant execute on function public.reject_event_guest_request(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Levering (kun Edge Functionen): claim/complete som probation-notifications
-- ---------------------------------------------------------------------------
-- `manual` er arrangørens/adminens eget "Send igen": afkølingen og loftet på
-- ti forsøg gælder kun de automatiske genforsøg fra pg_net/pg_cron.
create or replace function public.claim_event_guest_notification(
  request_id uuid,
  manual boolean default false
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  claimed_attempt integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can claim notifications'
      using errcode = '42501';
  end if;

  update public.event_guest_requests
  set decision_notification_status = 'sending',
      decision_notification_attempts = decision_notification_attempts + 1,
      decision_notification_started_at = now(),
      decision_notification_error = null
  where id = request_id
    and status in ('approved', 'rejected')
    and (
      decision_notification_status = 'pending'
      or (
        decision_notification_status = 'failed'
        and (
          manual
          or (
            decision_notification_attempts < 10
            and decision_notification_started_at < now() - interval '1 minute'
          )
        )
      )
      or (
        decision_notification_status = 'sending'
        and (manual or decision_notification_attempts < 10)
        and decision_notification_started_at < now() - interval '5 minutes'
      )
    )
  returning decision_notification_attempts into claimed_attempt;

  return coalesce(claimed_attempt, 0);
end;
$$;

create or replace function public.complete_event_guest_notification(
  request_id uuid,
  expected_attempt integer,
  succeeded boolean,
  failure_message text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can complete notifications'
      using errcode = '42501';
  end if;

  update public.event_guest_requests
  set decision_notification_status = case when succeeded then 'sent' else 'failed' end,
      decision_notification_sent_at = case when succeeded then now() else null end,
      decision_notification_error = case when succeeded then null else failure_message end
  where id = request_id
    and decision_notification_status = 'sending'
    and decision_notification_attempts = expected_attempt;
end;
$$;

revoke all on function public.claim_event_guest_notification(uuid, boolean)
  from public;
revoke all on function public.complete_event_guest_notification(
  uuid, integer, boolean, text
) from public;
grant execute on function public.claim_event_guest_notification(uuid, boolean)
  to service_role;
grant execute on function public.complete_event_guest_notification(
  uuid, integer, boolean, text
) to service_role;

create or replace function public.retry_event_guest_notifications()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  guest_request public.event_guest_requests%rowtype;
begin
  for guest_request in
    select *
    from public.event_guest_requests
    where status in ('approved', 'rejected')
      and decision_notification_attempts < 10
      and (
        (
          decision_notification_status in ('pending', 'failed')
          and (
            decision_notification_started_at is null
            or decision_notification_started_at < now() - interval '15 minutes'
          )
        )
        or (
          decision_notification_status = 'sending'
          and decision_notification_started_at < now() - interval '15 minutes'
        )
      )
  loop
    perform public.enqueue_event_guest_notification(
      guest_request.notification_function_url,
      guest_request.id,
      guest_request.notification_token
    );
  end loop;
end;
$$;

revoke all on function public.retry_event_guest_notifications() from public;

select cron.unschedule(jobid)
from cron.job
where jobname = 'retry-event-guest-notifications';

select cron.schedule(
  'retry-event-guest-notifications',
  '*/5 * * * *',
  'select public.retry_event_guest_notifications()'
);

-- ---------------------------------------------------------------------------
-- Dataopbevaring: gæstedata slettes 30 dage efter begivenheden
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_event_guest_requests()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.event_guest_requests as guest_request
  using public.events as guest_event
  where guest_event.id = guest_request.event_id
    and coalesce(guest_event.end_at, guest_event.start_at)
      < now() - interval '30 days';
$$;

revoke all on function public.purge_expired_event_guest_requests() from public;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-event-guest-requests';

select cron.schedule(
  'purge-expired-event-guest-requests',
  '10 3 * * *',
  'select public.purge_expired_event_guest_requests()'
);

-- ---------------------------------------------------------------------------
-- Nyhed til medlemmerne
-- ---------------------------------------------------------------------------
insert into public.feature_announcements (slug, title, body, path)
values (
  'offentlig-kalender',
  'Åbn en tur for folk uden for klubben',
  'Sæt kryds i "Åben for ikke-medlemmer", når du opretter eller retter en begivenhed. Så kan alle se den på den offentlige kalender og søge om at komme med -- du godkender eller afviser ansøgningerne på begivenheden, og ansøgeren får svar på e-mail. Godkendte gæster tæller med i deltagertallet.',
  'kalender'
)
on conflict (slug) do nothing;

-- PostgREST cacher skemaet; uden signalet kender API'et hverken viewet,
-- tabellen eller RPC'erne, før cachen selv udløber.
notify pgrst, 'reload schema';
