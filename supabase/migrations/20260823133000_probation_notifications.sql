-- Pålidelige Web Push-notifikationer for prøvemedlemskaber (#82).
-- Versionsnummeret er valgt efter kontrol af samtidige åbne PR-migrations.
-- Migrationen er idempotent, fordi Supabase Preview kan have set et tidligere
-- timestamp fra samme PR, før en samtidig migrationskonflikt blev opdaget.
--
-- Ansøgningen og dens leveringsstatus gemmes i samme transaktion. Selve push-
-- kaldet sker bagefter i probation-notifications-edge-functionen, fordi et
-- eksternt HTTP-kald ikke kan være del af Postgres-transaktionen. Statusfelterne
-- er derfor en lille, holdbar outbox: en fejl ændrer aldrig ansøgningens
-- pending/approved/rejected-status, og klienten kan vise og genforsøge fejlen.

-- Supabase registrerer extension-metadata uden for public; begge extensions
-- opretter stadig deres egne net/cron-schemaer til de faktiske funktioner.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.probation_applications
  add column if not exists notification_token uuid not null default gen_random_uuid(),
  add column if not exists notification_function_url text,
  add column if not exists admin_notification_status text not null default 'pending'
    check (admin_notification_status in ('pending', 'sending', 'sent', 'failed')),
  add column if not exists admin_notification_attempts integer not null default 0
    check (admin_notification_attempts >= 0),
  add column if not exists admin_notification_started_at timestamptz,
  add column if not exists admin_notification_sent_at timestamptz,
  add column if not exists admin_notification_error text,
  add column if not exists decision_notification_status text
    check (
      decision_notification_status is null
      or decision_notification_status in ('pending', 'sending', 'sent', 'failed')
    ),
  add column if not exists decision_notification_attempts integer not null default 0
    check (decision_notification_attempts >= 0),
  add column if not exists decision_notification_started_at timestamptz,
  add column if not exists decision_notification_sent_at timestamptz,
  add column if not exists decision_notification_error text;

-- Ældre ansøgninger har intet browserabonnement. Markér det som en eksplicit
-- fejl frem for at lade dem stå som "pending" uden en mulig leveringsvej.
update public.probation_applications
set admin_notification_status = 'failed',
    admin_notification_error =
      'Ansøgningen blev oprettet, før push-notifikationer blev indført.'
where notification_function_url is null;

-- Ét push-abonnement følger ansøgningen frem til afgørelsen. Tabellen kan kun
-- læses af Edge Functionens Secret key; hverken ansøgerens endpoint eller
-- krypteringsnøgler må kunne hentes gennem den offentlige API.
create table if not exists public.probation_application_push_subscriptions (
  application_id bigint primary key
    references public.probation_applications (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint probation_push_endpoint_length
    check (char_length(endpoint) <= 2048),
  constraint probation_push_endpoint_service
    check (
      endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/'
    ),
  constraint probation_push_p256dh_length
    check (char_length(p256dh) <= 256),
  constraint probation_push_auth_length
    check (char_length(auth) <= 256)
);

alter table public.probation_application_push_subscriptions enable row level security;
revoke all on public.probation_application_push_subscriptions from anon, authenticated;

-- Alle ansøgninger skal nu gå gennem RPC'en nedenfor, så ansøgning,
-- svarabonnement og første outbox-status enten oprettes samlet eller slet ikke.
drop policy if exists "Anyone can apply for probation"
  on public.probation_applications;

create or replace function public.probation_notification_function_url()
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

  return 'https://' || request_host || '/functions/v1/probation-notifications';
end;
$$;

create or replace function public.enqueue_probation_notification(
  function_url text,
  application_id bigint,
  notification_kind text,
  notification_token uuid
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  request_id bigint;
begin
  if function_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/probation-notifications$'
    or notification_kind not in ('admin', 'decision') then
    raise exception 'Invalid probation notification request'
      using errcode = '22023';
  end if;

  select net.http_post(
    url := function_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'applicationId', application_id,
      'kind', notification_kind,
      'notificationToken', notification_token
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.probation_notification_function_url() from public;
revoke all on function public.enqueue_probation_notification(
  text, bigint, text, uuid
) from public;

create or replace function public.submit_probation_application(
  applicant_full_name text,
  applicant_email citext,
  applicant_motivation text,
  push_endpoint text,
  push_p256dh text,
  push_auth text
)
returns table (application_id bigint, notification_token uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  application public.probation_applications%rowtype;
  function_url text;
begin
  if char_length(btrim(applicant_full_name)) = 0
    or char_length(btrim(applicant_motivation)) = 0
    or char_length(btrim(applicant_email::text)) = 0 then
    raise exception 'Application fields are required'
      using errcode = '22023';
  end if;

  if char_length(applicant_full_name) > 200
    or char_length(applicant_email::text) > 320
    or char_length(applicant_motivation) > 5000 then
    raise exception 'Application fields are too long'
      using errcode = '22001';
  end if;

  if char_length(btrim(push_endpoint)) = 0
    or char_length(btrim(push_p256dh)) = 0
    or char_length(btrim(push_auth)) = 0 then
    raise exception 'Push subscription is required'
      using errcode = '22023';
  end if;

  function_url := public.probation_notification_function_url();

  insert into public.probation_applications (
    full_name,
    email,
    motivation,
    notification_function_url
  )
  values (
    btrim(applicant_full_name),
    lower(btrim(applicant_email::text))::citext,
    btrim(applicant_motivation),
    function_url
  )
  returning * into application;

  insert into public.probation_application_push_subscriptions (
    application_id,
    endpoint,
    p256dh,
    auth
  )
  values (
    application.id,
    btrim(push_endpoint),
    btrim(push_p256dh),
    btrim(push_auth)
  );

  perform public.enqueue_probation_notification(
    function_url,
    application.id,
    'admin',
    application.notification_token
  );

  return query select application.id, application.notification_token;
end;
$$;

revoke all on function public.submit_probation_application(
  text, citext, text, text, text, text
) from public;
grant execute on function public.submit_probation_application(
  text, citext, text, text, text, text
) to anon, authenticated;

-- Godkendelse og afvisning ændrer fortsat ansøgningen atomisk. Nu oprettes
-- beslutningsnotifikationen i samme transaktion, så en leveringsfejl aldrig kan
-- få databasen til at se ud, som om beslutningen ikke blev taget.
create or replace function public.approve_probation_application(application_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  application public.probation_applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve probation applications'
      using errcode = '42501';
  end if;

  select *
    into application
  from public.probation_applications
  where id = application_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Application not found'
      using errcode = 'P0002';
  end if;

  insert into public.allowed_emails (email, note, invited_by)
  values (
    application.email,
    'Prøvemedlemskab: ' || application.full_name,
    auth.uid()
  )
  on conflict (email) do nothing;

  update public.probation_applications
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      decision_notification_status = case
        when application.notification_function_url is null then 'failed'
        else 'pending'
      end,
      decision_notification_started_at = null,
      decision_notification_sent_at = null,
      decision_notification_error = case
        when application.notification_function_url is null
          then 'Ansøgningen har intet push-abonnement, fordi den er fra før notifikationsflowet.'
        else null
      end
  where id = application_id;

  if application.notification_function_url is not null then
    perform public.enqueue_probation_notification(
      application.notification_function_url,
      application.id,
      'decision',
      application.notification_token
    );
  end if;
end;
$$;

create or replace function public.reject_probation_application(application_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  application public.probation_applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject probation applications'
      using errcode = '42501';
  end if;

  select *
    into application
  from public.probation_applications
  where id = application_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Application not found'
      using errcode = 'P0002';
  end if;

  update public.probation_applications
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      decision_notification_status = case
        when application.notification_function_url is null then 'failed'
        else 'pending'
      end,
      decision_notification_started_at = null,
      decision_notification_sent_at = null,
      decision_notification_error = case
        when application.notification_function_url is null
          then 'Ansøgningen har intet push-abonnement, fordi den er fra før notifikationsflowet.'
        else null
      end
  where id = application_id;

  if application.notification_function_url is not null then
    perform public.enqueue_probation_notification(
      application.notification_function_url,
      application.id,
      'decision',
      application.notification_token
    );
  end if;
end;
$$;

-- Kun service_role (Edge Functionens auto-injicerede Secret key) kan tage et
-- leveringsforsøg. Et forsøg, der døde midt i et kald, kan tages igen efter fem
-- minutter; ellers kunne rækken blive hængende permanent i "sending".
create or replace function public.claim_probation_notification(
  application_id bigint,
  notification_kind text
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

  if notification_kind = 'admin' then
    update public.probation_applications
    set admin_notification_status = 'sending',
        admin_notification_attempts = admin_notification_attempts + 1,
        admin_notification_started_at = now(),
        admin_notification_error = null
    where id = application_id
      and (
        admin_notification_status = 'pending'
        or (
          admin_notification_status = 'failed'
          and admin_notification_attempts < 10
          and admin_notification_started_at < now() - interval '1 minute'
        )
        or (
          admin_notification_status = 'sending'
          and admin_notification_attempts < 10
          and admin_notification_started_at < now() - interval '5 minutes'
        )
      )
    returning admin_notification_attempts into claimed_attempt;
  elsif notification_kind = 'decision' then
    update public.probation_applications
    set decision_notification_status = 'sending',
        decision_notification_attempts = decision_notification_attempts + 1,
        decision_notification_started_at = now(),
        decision_notification_error = null
    where id = application_id
      and status in ('approved', 'rejected')
      and (
        decision_notification_status = 'pending'
        or (
          decision_notification_status = 'failed'
          and decision_notification_attempts < 10
          and decision_notification_started_at < now() - interval '1 minute'
        )
        or (
          decision_notification_status = 'sending'
          and decision_notification_attempts < 10
          and decision_notification_started_at < now() - interval '5 minutes'
        )
      )
    returning decision_notification_attempts into claimed_attempt;
  else
    raise exception 'Unknown notification kind'
      using errcode = '22023';
  end if;

  return coalesce(claimed_attempt, 0);
end;
$$;

create or replace function public.complete_probation_notification(
  application_id bigint,
  notification_kind text,
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

  if notification_kind = 'admin' then
    update public.probation_applications
    set admin_notification_status = case when succeeded then 'sent' else 'failed' end,
        admin_notification_sent_at = case when succeeded then now() else null end,
        admin_notification_error = case when succeeded then null else failure_message end
    where id = application_id
      and admin_notification_status = 'sending'
      and admin_notification_attempts = expected_attempt;
  elsif notification_kind = 'decision' then
    update public.probation_applications
    set decision_notification_status = case when succeeded then 'sent' else 'failed' end,
        decision_notification_sent_at = case when succeeded then now() else null end,
        decision_notification_error = case when succeeded then null else failure_message end
    where id = application_id
      and decision_notification_status = 'sending'
      and decision_notification_attempts = expected_attempt;
  else
    raise exception 'Unknown notification kind'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.claim_probation_notification(bigint, text) from public;
revoke all on function public.complete_probation_notification(
  bigint, text, integer, boolean, text
) from public;
grant execute on function public.claim_probation_notification(bigint, text)
  to service_role;
grant execute on function public.complete_probation_notification(
  bigint, text, integer, boolean, text
) to service_role;

-- pg_net køer requestet i samme transaktion som ansøgningen/afgørelsen og
-- sender først efter commit. Cron samler requests op, der aldrig nåede frem,
-- eller fejlede midlertidigt. Claim-RPC'en ovenfor gør dubletter harmløse.
create or replace function public.retry_probation_notifications()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  application public.probation_applications%rowtype;
begin
  for application in
    select *
    from public.probation_applications
    where notification_function_url is not null
      and (
        (
          status = 'pending'
          and admin_notification_status in ('pending', 'failed')
          and admin_notification_attempts < 10
          and (
            admin_notification_started_at is null
            or admin_notification_started_at < now() - interval '15 minutes'
          )
        )
        or (
          status = 'pending'
          and admin_notification_status = 'sending'
          and admin_notification_attempts < 10
          and admin_notification_started_at < now() - interval '15 minutes'
        )
        or (
          decision_notification_status in ('pending', 'failed')
          and decision_notification_attempts < 10
          and (
            decision_notification_started_at is null
            or decision_notification_started_at < now() - interval '15 minutes'
          )
        )
        or (
          decision_notification_status = 'sending'
          and decision_notification_attempts < 10
          and decision_notification_started_at < now() - interval '15 minutes'
        )
      )
  loop
    if application.status = 'pending'
      and application.admin_notification_status in ('pending', 'failed')
      and application.admin_notification_attempts < 10
      and (
        application.admin_notification_started_at is null
        or application.admin_notification_started_at < now() - interval '15 minutes'
      ) then
      perform public.enqueue_probation_notification(
        application.notification_function_url,
        application.id,
        'admin',
        application.notification_token
      );
    end if;

    if application.status = 'pending'
      and application.admin_notification_status = 'sending'
      and application.admin_notification_attempts < 10
      and application.admin_notification_started_at < now() - interval '15 minutes'
    then
      perform public.enqueue_probation_notification(
        application.notification_function_url,
        application.id,
        'admin',
        application.notification_token
      );
    end if;

    if application.decision_notification_status in ('pending', 'failed')
      and application.decision_notification_attempts < 10
      and (
        application.decision_notification_started_at is null
        or application.decision_notification_started_at < now() - interval '15 minutes'
      ) then
      perform public.enqueue_probation_notification(
        application.notification_function_url,
        application.id,
        'decision',
        application.notification_token
      );
    end if;

    if application.decision_notification_status = 'sending'
      and application.decision_notification_attempts < 10
      and application.decision_notification_started_at < now() - interval '15 minutes'
    then
      perform public.enqueue_probation_notification(
        application.notification_function_url,
        application.id,
        'decision',
        application.notification_token
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.retry_probation_notifications() from public;

select cron.unschedule(jobid)
from cron.job
where jobname = 'retry-probation-notifications';

select cron.schedule(
  'retry-probation-notifications',
  '*/5 * * * *',
  'select public.retry_probation_notifications()'
);

notify pgrst, 'reload schema';
