-- Push-notifikationer ud over chatten (#216): ny begivenhed i kalenderen,
-- påmindelse dagen før en begivenhed, man er tilmeldt, og -- for admins -- en
-- ny indstilling til en badge, der skal godkendes. Hver med sit eget til/fra
-- på profilen. Den indstillede får ingen besked: en afvist indstilling må ikke
-- være synlig for modtageren (se badges-migrationen).
--
-- Tre ting lægges til:
--
--   1. notification_preferences: medlemmets valg pr. type. Skrives kun gennem
--      set_notification_preference, så en klient aldrig kan sætte et valg for
--      nogen anden. Ingen række betyder "ja tak" -- typerne er slået til for
--      alle, også dem der var medlem før denne migration, præcis som
--      feature_notifications_enabled har default true. badge_nomination_review
--      sendes kun til admins; et almindeligt medlem kan gemme valget, men får
--      alligevel aldrig den type.
--   2. push_deliveries: en holdbar log over, hvem der har fået hvilken
--      notifikation om hvad. claim_push_deliveries tager modtagerne atomisk
--      *før* der sendes, så to samtidige kald -- eller en planlagt kørsel, der
--      gentages -- aldrig sender den samme notifikation to gange.
--   3. Påmindelsen dagen før: pg_cron finder de begivenheder, der starter i
--      morgen, og beder Edge Functionen calendar-push sende med pg_net. Samme
--      mønster som retry_probation_notifications: databasen ejer status og
--      genforsøg, functionen ejer kun HTTP-kaldene til push-tjenesterne.

-- ---------------------------------------------------------------------------
-- 1. Præferencer pr. type
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    check (
      kind in ('event_created', 'event_reminder', 'badge_nomination_review')
    ),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.notification_preferences enable row level security;

-- Et medlem kan se sine egne valg; alle andres er ikke deres sag. Skrivning
-- går udelukkende gennem RPC'en nedenfor, så authenticated får kun select.
create policy "Members can read own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.notification_preferences to authenticated;
grant select, insert, update, delete
  on table public.notification_preferences to service_role;

-- Valget hører til personen, ikke til installationen, ligesom
-- chat_notification_preference (#179): slår man påmindelser fra på telefonen,
-- skal computeren også tie. Filtreringen sker i Edge Functionen, ikke i
-- klienten -- en klient kan ikke undlade at modtage en notifikation, den
-- allerede har fået.
create function public.set_notification_preference(
  p_kind text,
  p_enabled boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_kind is null
    or p_kind not in (
      'event_created', 'event_reminder', 'badge_nomination_review'
    )
  then
    raise exception 'Unknown notification kind' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'enabled is required' using errcode = '22023';
  end if;

  insert into public.notification_preferences (user_id, kind, enabled)
  values (actor, p_kind, p_enabled)
  on conflict (user_id, kind) do update
    set enabled = excluded.enabled,
        updated_at = now();
end;
$$;

revoke all on function public.set_notification_preference(text, boolean)
  from public;
grant execute on function public.set_notification_preference(text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Leveringslog: én notifikation pr. (type, emne, medlem)
-- ---------------------------------------------------------------------------
-- Loggen hænger på medlemmet og ikke på abonnementet (i modsætning til
-- feature_announcement_push_deliveries): "du er tilmeldt en tur i morgen" er
-- én besked til én person, uanset hvor mange enheder de har. Emnet er et
-- uuid -- begivenheden, indstillingen -- så en planlagt kørsel, der finder den
-- samme begivenhed igen næste time, ikke kan sende igen.
--
-- kind er låst til de samme typer som notification_preferences, så en
-- stavefejl i et deliverPush-kald fejler højt i stedet for stille at starte
-- en ny, ufiltreret logserie. Næste type (#222, ventelisten) udvider begge
-- constraints i sin egen migration.
create table public.push_deliveries (
  kind text not null
    check (
      kind in ('event_created', 'event_reminder', 'badge_nomination_review')
    ),
  subject_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (kind, subject_id, user_id)
);

alter table public.push_deliveries enable row level security;

-- Driftsdata på linje med push_vapid_keys: ingen policies og ingen grants til
-- klientrollerne. Kun functionens Secret key rører loggen.
revoke all on table public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.push_deliveries
  to service_role;

-- Tager modtagerne til en notifikation. Rækkerne skrives *før* der sendes:
-- den, der får rækken, sender; den, der rammer en eksisterende række, får
-- intet tilbage og sender ikke. Returnerer kun de medlemmer, der ikke allerede
-- stod i loggen. Prisen er, at en levering, der fejler hos push-tjenesten,
-- ikke forsøges igen -- hellere en notifikation, der mangler, end den samme to
-- gange (samme afvejning som i feature-announcements).
create function public.claim_push_deliveries(
  p_kind text,
  p_subject_id uuid,
  p_user_ids uuid[]
)
returns setof uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can claim push deliveries'
      using errcode = '42501';
  end if;

  return query
  insert into public.push_deliveries (kind, subject_id, user_id)
  select p_kind, p_subject_id, recipient.user_id
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) as recipient (user_id)
  -- Et medlem, der slettede sin konto mellem opslaget og claim'en, må ikke
  -- vælte hele kaldet på en fremmednøgle.
  where exists (
    select 1 from public.profiles where profiles.id = recipient.user_id
  )
  on conflict (kind, subject_id, user_id) do nothing
  returning push_deliveries.user_id;
end;
$$;

revoke all on function public.claim_push_deliveries(text, uuid, uuid[])
  from public;
grant execute on function public.claim_push_deliveries(text, uuid, uuid[])
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Påmindelse dagen før
-- ---------------------------------------------------------------------------
-- pg_net kender ikke functionens URL af sig selv, og en cron-kørsel har ingen
-- request at udlede den af. probation_notification_function_url() løser det
-- ved at læse host-headeren i det request, der opretter ansøgningen; her gør
-- en trigger det samme, når en begivenhed oprettes eller redigeres fra appen.
-- Ingen header (pgTAP, psql) giver null -- ikke en fejl -- og cron falder så
-- tilbage til den seneste kendte URL fra en anden begivenhed: det er samme
-- host for alle.
create function public.push_function_url(function_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  request_host text;
begin
  request_host := (
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'host'
  );

  if request_host is null
    or request_host !~ '^[a-z0-9-]+[.]supabase[.]co$'
    or function_name !~ '^[a-z0-9-]+$' then
    return null;
  end if;

  return 'https://' || request_host || '/functions/v1/' || function_name;
end;
$$;

revoke all on function public.push_function_url(text) from public;

alter table public.events
  add column notification_function_url text;

-- Begivenhederne fra før denne migration har aldrig set et request. De får
-- hosten én gang her, fra den seneste ansøgning om prøvemedlemskab, der
-- huskede den -- samme host, blot en anden function -- så de også får deres
-- påmindelse fra dag ét. Kører før triggeren nedenfor, som ellers ville
-- overskrive værdien med null, fordi en migration heller ikke har et request.
update public.events
set notification_function_url = (
  select regexp_replace(
    application.notification_function_url,
    '/probation-notifications$',
    '/calendar-push'
  )
  from public.probation_applications as application
  where application.notification_function_url is not null
  order by application.created_at desc
  limit 1
)
where notification_function_url is null;

-- Kolonnen sættes af triggeren og kun af den: et medlem har update på
-- events, men må ikke kunne pege påmindelsen mod en fremmed host. En
-- begivenhed uden URL (oprettet uden request) får den, næste gang den
-- redigeres fra appen.
--
-- Flyttes begivenheden til en anden dag, glemmes påmindelsen: loggen i
-- push_deliveries og kørslen i event_reminders (oprettet nedenfor)
-- ryddes, så vinduet dagen før den nye dato sender forfra. Ellers ville den,
-- der fik "i morgen" om den gamle dato, aldrig høre om den nye. Et nyt
-- klokkeslæt samme dag rører ikke loggen.
--
-- security definer, fordi push_function_url ikke er givet til klientrollerne,
-- og triggeren ellers ville køre som det medlem, der opretter begivenheden.
create function public.remember_event_notification_url()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.notification_function_url := public.push_function_url('calendar-push');
  else
    new.notification_function_url := coalesce(
      old.notification_function_url,
      public.push_function_url('calendar-push')
    );

    if (new.start_at at time zone 'Europe/Copenhagen')::date
      is distinct from (old.start_at at time zone 'Europe/Copenhagen')::date
    then
      delete from public.push_deliveries
      where kind = 'event_reminder' and subject_id = old.id;
      delete from public.event_reminders where event_id = old.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger events_remember_notification_url
  before insert or update on public.events
  for each row execute function public.remember_event_notification_url();

-- Status for påmindelsen pr. begivenhed: en lille outbox som
-- probation_applications' notifikationsfelter. token er det, pg_net sender
-- med, og det, functionen kræver -- kalderen er ellers ikke logget ind.
-- Tabellen er kun for Secret key; et medlem kan alligevel ikke bruge den.
create table public.event_reminders (
  event_id uuid primary key references public.events (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

alter table public.event_reminders enable row level security;
revoke all on table public.event_reminders from anon, authenticated;
grant select, insert, update, delete on table public.event_reminders
  to service_role;

-- Sender påmindelsen ud. Vinduet åbner kl. 17 dagen før og lukker, når
-- begivenheden begynder. Efter en vellykket kørsel kigges der forbi igen hver
-- time, så en, der først tilmelder sig om aftenen, også får sin påmindelse --
-- leveringsloggen sørger for, at de andre ikke får den igen. Fejl og kørsler,
-- der gik i stå, forsøges igen efter et kvarter, og vinduet begrænser
-- antallet af forsøg af sig selv.
create function public.enqueue_event_reminders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  local_now timestamp := now() at time zone 'Europe/Copenhagen';
  fallback_url text;
  reminder record;
  run public.event_reminders%rowtype;
  enqueued integer := 0;
begin
  select event.notification_function_url
  into fallback_url
  from public.events as event
  where event.notification_function_url is not null
  order by event.created_at desc
  limit 1;

  for reminder in
    select
      event.id,
      coalesce(event.notification_function_url, fallback_url) as function_url
    from public.events as event
    left join public.event_reminders as existing on existing.event_id = event.id
    where event.start_at > now()
      and (event.start_at at time zone 'Europe/Copenhagen')::date
        <= local_now::date + 1
      and (
        (event.start_at at time zone 'Europe/Copenhagen')::date = local_now::date
        or local_now::time >= time '17:00'
      )
      and (
        existing.event_id is null
        or (
          existing.status = 'sent'
          and existing.started_at < now() - interval '1 hour'
        )
        or (
          existing.status in ('failed', 'sending')
          and existing.started_at < now() - interval '15 minutes'
        )
      )
    order by event.start_at
  loop
    if reminder.function_url is null
      or reminder.function_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/calendar-push$'
    then
      continue;
    end if;

    insert into public.event_reminders (event_id, status, attempts, started_at)
    values (reminder.id, 'sending', 1, now())
    on conflict (event_id) do update
      set status = 'sending',
          attempts = event_reminders.attempts + 1,
          started_at = now(),
          error = null
    returning * into run;

    perform net.http_post(
      url := reminder.function_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'kind', 'event_reminder',
        'eventId', run.event_id,
        'token', run.token
      ),
      timeout_milliseconds := 10000
    );
    enqueued := enqueued + 1;
  end loop;

  -- Loggen behøver kun at huske, så længe et emne kan dukke op igen. En
  -- begivenhed er forbi, og en indstilling er afgjort, længe før 90 dage.
  delete from public.push_deliveries
  where sent_at < now() - interval '90 days';

  return enqueued;
end;
$$;

revoke all on function public.enqueue_event_reminders() from public;

-- Functionens to RPC'er: tag kørslen (bekræfter token og at kørslen faktisk
-- er i gang) og meld resultatet tilbage. Samme forsøgsnummer-fence som
-- complete_probation_notification, så en overhalet kørsel ikke kan
-- overskrive en nyere.
create function public.claim_event_reminder(
  p_event_id uuid,
  p_token uuid
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  claimed_attempt integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can claim event reminders'
      using errcode = '42501';
  end if;

  select attempts
  into claimed_attempt
  from public.event_reminders
  where event_id = p_event_id
    and token = p_token
    and status = 'sending';

  return coalesce(claimed_attempt, 0);
end;
$$;

create function public.complete_event_reminder(
  p_event_id uuid,
  p_expected_attempt integer,
  p_succeeded boolean,
  p_failure_message text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can complete event reminders'
      using errcode = '42501';
  end if;

  update public.event_reminders
  set status = case when p_succeeded then 'sent' else 'failed' end,
      sent_at = case when p_succeeded then now() else sent_at end,
      error = case when p_succeeded then null else p_failure_message end
  where event_id = p_event_id
    and status = 'sending'
    and attempts = p_expected_attempt;
end;
$$;

revoke all on function public.claim_event_reminder(uuid, uuid) from public;
revoke all on function public.complete_event_reminder(
  uuid, integer, boolean, text
) from public;
grant execute on function public.claim_event_reminder(uuid, uuid)
  to service_role;
grant execute on function public.complete_event_reminder(
  uuid, integer, boolean, text
) to service_role;

-- Hvert kvarter, ligesom retry-probation-notifications hvert femte minut.
-- Kørslen er billig: uden for vinduet finder den ingen begivenheder.
select cron.unschedule(jobid)
from cron.job
where jobname = 'enqueue-event-reminders';

select cron.schedule(
  'enqueue-event-reminders',
  '*/15 * * * *',
  'select public.enqueue_event_reminders()'
);

-- ---------------------------------------------------------------------------
-- Nyheden til medlemmerne
-- ---------------------------------------------------------------------------
insert into public.feature_announcements (slug, title, body, path)
values (
  'push-kalender-og-maerker',
  'Få besked om nye ture i kalenderen',
  'Appen kan nu sende dig en notifikation, når der kommer en ny begivenhed i kalenderen, og dagen før en tur du er tilmeldt. Vælg selv hvilke på din profil under "Notifikationer".',
  'profil'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
