-- Ansøgningen må ikke gå tabt, fordi notifikationsrøret fejler.
--
-- Symptomet var "Ansøgningen kan ikke sendes lige nu. Prøv igen om lidt." på
-- /ansoeg. Den tekst er klientens oversættelse af `temporarily_unavailable`,
-- som `submit-probation-application` svarer, når RPC'en kaster -- og RPC'en
-- kastede for ting, der intet har med selve ansøgningen at gøre:
--
--   1. `probation_notification_function_url()` rejste `55000`, hvis
--      host-headeren ikke var et `*.supabase.co`-domæne. Søsteren
--      `push_function_url()` (20260913150000) returnerer i samme situation
--      null, netop fordi en manglende adresse ikke er en fejl i det, brugeren
--      prøver på; den her var aldrig fulgt med.
--   2. `enqueue_probation_notification()` kalder `net.http_post` inde i
--      ansøgningens transaktion. Enhver fejl dér -- pg_net nede, kø fuld --
--      rullede ansøgningen tilbage sammen med sig selv.
--
-- Herefter: adressen må gerne mangle, køen må gerne fejle, og ansøgningen
-- bliver stående. Leveringen noteres som `failed` med årsagen i
-- `admin_notification_error`, præcis som enhver anden leveringsfejl, så den
-- kan ses i adminpanelet. Cron-genforsøget henter desuden den sidst kendte
-- adresse, så en ansøgning, der blev gemt uden en, selv kommer af sted, når
-- årsagen er væk -- i stedet for at ligge usynligt og vente på, at nogen
-- kigger i databasen.

-- ---------------------------------------------------------------------------
-- 1. En manglende adresse er ikke en fejl
-- ---------------------------------------------------------------------------
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

  -- Ingen header (pgTAP, psql, cron) eller en vært, der ikke er et
  -- Supabase-funktionsdomæne, giver null. Kalderen afgør, hvad det betyder;
  -- for en ansøgning betyder det "gem den, og notificér senere".
  if request_host is null
    or request_host !~ '^[a-z0-9-]+[.]supabase[.]co$' then
    return null;
  end if;

  return 'https://' || request_host || '/functions/v1/probation-notifications';
end;
$$;

-- Den sidst kendte adresse. Alle ansøgninger ligger i samme projekt og har
-- derfor samme funktionsvært, så en ansøgning, der ikke selv kunne udlede
-- adressen, kan låne den af en, der kunne. Kun til brug inde i de
-- security definer-funktioner herunder; ingen rolle får execute.
create or replace function public.probation_notification_last_known_url()
returns text
language sql
stable
security definer set search_path = public
as $$
  select notification_function_url
  from public.probation_applications
  where notification_function_url is not null
  order by id desc
  limit 1;
$$;

revoke all on function public.probation_notification_last_known_url()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Indsendelsen overlever en fejlende notifikation
-- ---------------------------------------------------------------------------
-- Kroppen er den samme som i 20260823161500_probation_application_rate_limits.sql
-- frem til rate-limitten. Det, der er nyt, står efter "-- NY:"-kommentarerne.
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

  -- NY: adressen må mangle. Kan den ikke udledes af requestet, lånes den
  -- sidst kendte; findes heller ikke den, gemmes ansøgningen uden -- og
  -- cron-genforsøget tager den, så snart en adresse er kendt.
  function_url := coalesce(
    public.probation_notification_function_url(),
    public.probation_notification_last_known_url()
  );

  begin
    insert into public.probation_applications (
      full_name,
      email,
      motivation,
      notification_function_url,
      -- NY: uden adresse er der ingen leveringsvej endnu. Det noteres som en
      -- leveringsfejl i stedet for at vælte ansøgningen.
      admin_notification_status,
      admin_notification_error
    )
    values (
      btrim(applicant_full_name),
      lower(btrim(applicant_email::text))::citext,
      btrim(applicant_motivation),
      function_url,
      case when function_url is null then 'failed' else 'pending' end,
      case
        when function_url is null
          then 'Ansøgningen blev gemt, men funktionens adresse kunne ikke udledes, så admin-notifikationen venter på et genforsøg.'
      end
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

  -- NY: notifikationen er et sidespor. `net.http_post` sker i ansøgningens
  -- transaktion, så en fejl her rev før hele ansøgningen med sig. Nu ender den
  -- samme sted som enhver anden leveringsfejl: i statusfelterne, hvor
  -- adminpanelet og cron-genforsøget kan se den.
  if function_url is not null then
    begin
      perform public.enqueue_probation_notification(
        function_url,
        application.id,
        'admin',
        application.notification_token
      );
    exception
      when others then
        update public.probation_applications
        set admin_notification_status = 'failed',
            admin_notification_error = left(
              'Notifikationen kunne ikke sættes i kø: ' || sqlerrm,
              1000
            )
        where id = application.id;
    end;
  end if;

  return query
    select
      'accepted'::text,
      null::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Genforsøget henter en manglende adresse
-- ---------------------------------------------------------------------------
-- Uændret bortset fra adressen: rækker uden en var før usynlige for cron og
-- blev aldrig sendt. Nu låner de den sidst kendte -- men kun hvis ansøgningen
-- har et push-abonnement, så de gamle rækker fra før notifikationsflowet
-- (markeret `failed` i 20260823133000) stadig får lov at ligge.
create or replace function public.retry_probation_notifications()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  application public.probation_applications%rowtype;
  fallback_url text := public.probation_notification_last_known_url();
begin
  for application in
    select *
    from public.probation_applications
    where (
        notification_function_url is not null
        or (
          fallback_url is not null
          and exists (
            select 1
            from public.probation_application_push_subscriptions subscription
            where subscription.application_id = probation_applications.id
          )
        )
      )
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
    if application.notification_function_url is null then
      update public.probation_applications
      set notification_function_url = fallback_url
      where id = application.id;
      application.notification_function_url := fallback_url;
    end if;

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
