-- Server-side spam protection for the public probation application form (#87).
-- Raw network addresses and e-mail addresses never enter the rate-limit table:
-- the Edge Function HMAC-hashes each signal before invoking the service-only RPC.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.probation_submission_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  network_hash text not null check (network_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default clock_timestamp()
);

create index if not exists probation_submission_attempts_ip
  on private.probation_submission_attempts (ip_hash, attempted_at desc);
create index if not exists probation_submission_attempts_network
  on private.probation_submission_attempts (network_hash, attempted_at desc);
create index if not exists probation_submission_attempts_email
  on private.probation_submission_attempts (email_hash, attempted_at desc);
create index if not exists probation_submission_attempts_time
  on private.probation_submission_attempts (attempted_at desc);

revoke all on private.probation_submission_attempts
  from public, anon, authenticated, service_role;
revoke all on sequence private.probation_submission_attempts_id_seq
  from public, anon, authenticated, service_role;

-- The old function trusted the anonymous caller to provide every input and had no
-- server-owned abuse signal. Removing it also prevents bypassing the Edge Function.
revoke all on function public.submit_probation_application(
  text, citext, text, text, text, text
) from public, anon, authenticated;
drop function public.submit_probation_application(
  text, citext, text, text, text, text
);

revoke insert on public.probation_applications from anon, authenticated;

create or replace function public.submit_probation_application_limited(
  applicant_full_name text,
  applicant_email citext,
  applicant_motivation text,
  push_endpoint text,
  push_p256dh text,
  push_auth text,
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
  application public.probation_applications%rowtype;
  function_url text;
  attempt_time timestamptz := clock_timestamp();
  retry_at timestamptz := clock_timestamp();
  candidate_retry_at timestamptz;
  ip_short_count bigint;
  ip_daily_count bigint;
  email_daily_count bigint;
  network_daily_count bigint;
  global_daily_count bigint;
  lock_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can submit probation applications'
      using errcode = '42501';
  end if;

  if applicant_full_name is null
    or applicant_email is null
    or applicant_motivation is null
    or push_endpoint is null
    or push_p256dh is null
    or push_auth is null
    or char_length(btrim(applicant_full_name)) = 0
    or char_length(btrim(applicant_motivation)) = 0
    or char_length(btrim(applicant_email::text)) = 0
    or char_length(btrim(push_endpoint)) = 0
    or char_length(btrim(push_p256dh)) = 0
    or char_length(btrim(push_auth)) = 0 then
    raise exception 'Application fields are required'
      using errcode = '22023';
  end if;

  if char_length(applicant_full_name) > 200
    or char_length(applicant_email::text) > 320
    or char_length(applicant_motivation) > 5000
    or char_length(push_endpoint) > 2048
    or char_length(push_p256dh) > 256
    or char_length(push_auth) > 256 then
    raise exception 'Application fields are too long'
      using errcode = '22001';
  end if;

  if btrim(applicant_email::text)
      !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or btrim(push_endpoint)
      !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/' then
    raise exception 'Application fields are invalid'
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

  -- Acquire every relevant lock in lexical order. This serializes concurrent
  -- requests sharing any signal and avoids deadlocks between overlapping limits.
  for lock_key in
    select value
    from (
      values
        ('global'),
        ('email:' || normalized_email_hash),
        ('ip:' || exact_ip_hash),
        ('network:' || client_network_hash)
    ) as lock_keys(value)
    order by value
  loop
    perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));
  end loop;

  insert into private.probation_submission_attempts (
    ip_hash,
    network_hash,
    email_hash,
    attempted_at
  )
  values (
    exact_ip_hash,
    client_network_hash,
    normalized_email_hash,
    attempt_time
  );

  select count(*)
    into ip_short_count
  from private.probation_submission_attempts
  where ip_hash = exact_ip_hash
    and attempted_at > attempt_time - interval '15 minutes';

  select count(*)
    into ip_daily_count
  from private.probation_submission_attempts
  where ip_hash = exact_ip_hash
    and attempted_at > attempt_time - interval '24 hours';

  select count(*)
    into email_daily_count
  from private.probation_submission_attempts
  where email_hash = normalized_email_hash
    and attempted_at > attempt_time - interval '24 hours';

  select count(*)
    into network_daily_count
  from private.probation_submission_attempts
  where network_hash = client_network_hash
    and attempted_at > attempt_time - interval '24 hours';

  select count(*)
    into global_daily_count
  from private.probation_submission_attempts
  where attempted_at > attempt_time - interval '24 hours';

  if ip_short_count > 3
    or ip_daily_count > 10
    or email_daily_count > 3
    or network_daily_count > 25
    or global_daily_count > 1000 then
    if ip_short_count > 3 then
      select attempted_at + interval '15 minutes'
        into candidate_retry_at
      from private.probation_submission_attempts
      where ip_hash = exact_ip_hash
        and attempted_at > attempt_time - interval '15 minutes'
      order by attempted_at
      offset greatest(ip_short_count - 3, 0)
      limit 1;
      retry_at := greatest(retry_at, candidate_retry_at);
    end if;

    if ip_daily_count > 10 then
      select attempted_at + interval '24 hours'
        into candidate_retry_at
      from private.probation_submission_attempts
      where ip_hash = exact_ip_hash
        and attempted_at > attempt_time - interval '24 hours'
      order by attempted_at
      offset greatest(ip_daily_count - 10, 0)
      limit 1;
      retry_at := greatest(retry_at, candidate_retry_at);
    end if;

    if email_daily_count > 3 then
      select attempted_at + interval '24 hours'
        into candidate_retry_at
      from private.probation_submission_attempts
      where email_hash = normalized_email_hash
        and attempted_at > attempt_time - interval '24 hours'
      order by attempted_at
      offset greatest(email_daily_count - 3, 0)
      limit 1;
      retry_at := greatest(retry_at, candidate_retry_at);
    end if;

    if network_daily_count > 25 then
      select attempted_at + interval '24 hours'
        into candidate_retry_at
      from private.probation_submission_attempts
      where network_hash = client_network_hash
        and attempted_at > attempt_time - interval '24 hours'
      order by attempted_at
      offset greatest(network_daily_count - 25, 0)
      limit 1;
      retry_at := greatest(retry_at, candidate_retry_at);
    end if;

    if global_daily_count > 1000 then
      select attempted_at + interval '24 hours'
        into candidate_retry_at
      from private.probation_submission_attempts
      where attempted_at > attempt_time - interval '24 hours'
      order by attempted_at
      offset greatest(global_daily_count - 1000, 0)
      limit 1;
      retry_at := greatest(retry_at, candidate_retry_at);
    end if;

    return query
      select
        'rate_limited'::text,
        greatest(
          1,
          ceil(extract(epoch from retry_at - attempt_time))::integer
        );
    return;
  end if;

  function_url := public.probation_notification_function_url();

  begin
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
  exception
    when unique_violation then
      -- Both expected conflicts are deliberately indistinguishable publicly.
      -- Re-raise any unrelated unique violation instead of hiding a schema bug.
      if exists (
        select 1
        from public.allowed_emails
        where email = lower(btrim(applicant_email::text))::citext
      ) or exists (
        select 1
        from public.probation_applications
        where email = lower(btrim(applicant_email::text))::citext
          and status = 'pending'
      ) then
        return query
          select
            'accepted'::text,
            null::integer;
        return;
      end if;
      raise;
  end;

  return query
    select
      'accepted'::text,
      null::integer;
end;
$$;

revoke all on function public.submit_probation_application_limited(
  text, citext, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_probation_application_limited(
  text, citext, text, text, text, text, text, text, text
) to service_role;

-- Rate-limit events are useful only slightly beyond the longest rolling window.
-- Keep cleanup in a private, ungranted function so the cron job has one narrow
-- operation rather than embedding broader SQL in its command.
create or replace function private.cleanup_probation_submission_attempts()
returns void
language sql
security definer set search_path = private
as $$
  delete from private.probation_submission_attempts
  where attempted_at <= now() - interval '25 hours';
$$;

revoke all on function private.cleanup_probation_submission_attempts()
  from public, anon, authenticated, service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-probation-submission-attempts';

select cron.schedule(
  'cleanup-probation-submission-attempts',
  '17 * * * *',
  'select private.cleanup_probation_submission_attempts()'
);

notify pgrst, 'reload schema';
