-- #239: fjerner e-mail-svaret til gæster på åbne begivenheder (#224/PR #226).
-- Kaptajnen ville ikke have Resend med i produktet -- arrangøren svarer nu
-- selv fra sin egen mailklient (option B). `GuestRequestsSection` viser
-- gæstens e-mail og en "Skriv til gæsten"-knap, der åbner en `mailto:` med et
-- klart svar, godkendt eller afvist.
--
-- Det fjerner behovet for hele outbox'en: `claim_/complete_event_guest_notification`,
-- `retry_event_guest_notifications` (og dens `pg_cron`-job), `pg_net`-kaldet i
-- `decide_event_guest_request`, og de bagvedliggende hjælpefunktioner
-- `event_guest_notification_function_url` og `enqueue_event_guest_notification`.
--
-- Delivery-kolonnerne (`notification_token`, `notification_function_url`,
-- `decision_notification_*`) droppes helt frem for at lade dem stå ubrugte:
-- de var kun legitimation til og status for et leveringsflow, der ikke
-- længere findes, og at beholde dem ville kun invitere til, at en senere
-- ændring ved en fejl læser eller skriver dem igen. `approve_/reject_event_guest_request`
-- beholder samme autorisation (`can_manage_event_guests`) og samme
-- fejlkoder/opførsel for `status <> 'pending'`; de sætter blot ikke længere
-- en leveringsstatus.

-- ---------------------------------------------------------------------------
-- 1. Planlagte kørsler og leverings-RPC'er
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'retry-event-guest-notifications';

drop function if exists public.retry_event_guest_notifications();
drop function if exists public.claim_event_guest_notification(uuid, boolean);
drop function if exists public.complete_event_guest_notification(
  uuid, integer, boolean, text
);
drop function if exists public.enqueue_event_guest_notification(text, uuid, uuid);
drop function if exists public.event_guest_notification_function_url();

-- ---------------------------------------------------------------------------
-- 2. Afgørelsen sender ikke længere noget -- den sætter kun status
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
      reviewed_by = auth.uid()
  where id = request_id;
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
-- 3. Indsendelsen opretter ikke længere en leverings-URL
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

  normalized_email := lower(btrim(guest_email::text))::citext;
  trimmed_message := nullif(btrim(coalesce(guest_message, '')), '');

  begin
    insert into public.event_guest_requests (
      event_id,
      full_name,
      email,
      message,
      party_size
    )
    values (
      target_event_id,
      btrim(guest_full_name),
      normalized_email,
      trimmed_message,
      guest_party_size
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
-- 4. Delivery-kolonnerne er ikke længere brugt af noget
-- ---------------------------------------------------------------------------
alter table public.event_guest_requests
  drop column if exists notification_token,
  drop column if exists notification_function_url,
  drop column if exists decision_notification_status,
  drop column if exists decision_notification_attempts,
  drop column if exists decision_notification_started_at,
  drop column if exists decision_notification_sent_at,
  drop column if exists decision_notification_error;

-- `revoke all` fjerner også kolonnegrants; giv dem igen uden de droppede felter.
revoke all on table public.event_guest_requests from public, anon, authenticated;
grant select (
  id, event_id, full_name, email, message, party_size, status, created_at,
  reviewed_at, reviewed_by
)
  on table public.event_guest_requests
  to authenticated;
grant delete, insert, select, update on table public.event_guest_requests
  to service_role;

-- PostgREST cacher skemaet; uden signalet kender API'et ikke de fjernede
-- funktioner og kolonner, før cachen selv udløber.
notify pgrst, 'reload schema';
