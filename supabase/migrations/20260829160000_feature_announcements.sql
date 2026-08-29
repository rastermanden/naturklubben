-- Nyheder om nye funktioner: medlemmerne skal have besked, når appen har fået
-- noget nyt -- både i appen og som en push-notifikation.
--
-- En nyhed er kode, ikke indhold nogen taster ind i et panel: hver funktion,
-- der udvikles, lægger sin egen række her i sin egen migration. Så følger
-- beskeden automatisk med deployet i stedet for at afhænge af, at et menneske
-- husker at skrive den bagefter.
--
-- Leveringen er den samme outbox som i probation-notifications (#82): rækken
-- bærer sin egen status, edge-functionen tager et forsøg med
-- claim_feature_announcement_push og melder resultatet tilbage. Forskellen er,
-- hvem der sætter kaldet i gang. Rækken oprettes af en migration, og en
-- migration har ingen request-headers at udlede functionens URL af, som
-- probation-flowet gør -- derfor kalder klienten functionen, første gang et
-- medlem åbner appen efter deployet. Fan-out'en sker stadig på serveren: den
-- kalder afgør intet om indhold eller modtagere, og claim-RPC'en gør et
-- gentaget kald til ingenting.

create table public.feature_announcements (
  id uuid primary key default gen_random_uuid(),
  -- Stabil nøgle skrevet i migrationen, så den samme nyhed kan genkendes på
  -- tværs af miljøer (og af en migration, der køres igen på en preview-branch).
  slug text not null unique,
  title text not null,
  body text not null,
  -- App-sti, notifikationen skal åbne -- relativ til appens base, fx 'chat'.
  path text,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Outbox-felterne. De er driftsdata og deles ikke med medlemmerne; se
  -- kolonnegrant'en nedenfor.
  push_status text not null default 'pending'
    check (push_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  push_attempts integer not null default 0 check (push_attempts >= 0),
  push_started_at timestamptz,
  push_sent_at timestamptz,
  push_error text,
  constraint feature_announcement_slug_format
    check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  constraint feature_announcement_title_length
    check (char_length(btrim(title)) between 1 and 120),
  constraint feature_announcement_body_length
    check (char_length(btrim(body)) between 1 and 600),
  -- Stien lander i service workerens `new URL(path, base)`. En absolut URL
  -- eller et protokolløst "//andetsted" ville pege ud af appen, så kun rene
  -- relative stier slipper igennem.
  constraint feature_announcement_path_format
    check (path is null or path ~ '^[a-z0-9æøå][a-z0-9æøå/-]{0,59}$')
);

create index feature_announcements_released_at_idx
  on public.feature_announcements (released_at desc);

alter table public.feature_announcements enable row level security;

-- Nyheder er fælles læsestof for medlemmer. En nyhed med et fremtidigt
-- released_at er endnu ikke udsendt og skal heller ikke kunne læses forlods.
create policy "Members can read released feature announcements"
  on public.feature_announcements for select
  to authenticated
  using (released_at <= now());

-- Ingen skriver nyheder gennem API'et: rækkerne kommer fra migrationer, og
-- leveringsstatussen sættes udelukkende af de to RPC'er nedenfor. Samtidig er
-- outbox-felterne ikke medlemmernes sag, så select'en er en eksplicit
-- kolonneliste frem for hele tabellen.
revoke all on table public.feature_announcements from anon, authenticated;
grant select (id, slug, title, body, path, released_at)
  on table public.feature_announcements to authenticated;

-- Hvad det enkelte medlem har set. Ligger i sin egen tabel frem for som et felt
-- på nyheden, fordi den er personlig: to medlemmer læser den samme nyhed på
-- hvert sit tidspunkt.
create table public.feature_announcement_reads (
  announcement_id uuid not null
    references public.feature_announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index feature_announcement_reads_user_id_idx
  on public.feature_announcement_reads (user_id);

alter table public.feature_announcement_reads enable row level security;

create policy "Users can read own announcement reads"
  on public.feature_announcement_reads for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can mark announcements as read"
  on public.feature_announcement_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can unmark own announcement reads"
  on public.feature_announcement_reads for delete
  to authenticated
  using (auth.uid() = user_id);

-- read_at er tidspunktet, rækken blev sat -- ikke noget, der redigeres bagefter.
revoke update on table public.feature_announcement_reads
  from anon, authenticated;

-- Valget hører til personen og ikke til installationen, præcis som
-- chat_notification_preference (#179): slår man nyhedsnotifikationer fra på
-- telefonen, skal computeren også tie. Filtreringen sker server-side i
-- feature-announcements.
alter table public.profiles
  add column feature_notifications_enabled boolean not null default true;

-- Tabel-update er trukket tilbage fra authenticated (#96), så profilens
-- redigerbare felter er en eksplicit kolonneliste.
grant update (feature_notifications_enabled)
  on table public.profiles
  to authenticated;

-- Nyheder, der stadig mangler at blive sendt. Reglen for hvad der er
-- "udestående" står ét sted og bruges både af functionen, der henter listen, og
-- af claim'en, der tager forsøget.
--
-- Vinduet på syv dage er med vilje: en nyhed, der af en eller anden grund har
-- ligget uleveret i to uger, skal ikke pludselig vække alle. Den står stadig i
-- appen under Nyheder.
create function public.pending_feature_announcement_pushes()
returns table (
  id uuid,
  slug text,
  title text,
  body text,
  path text
)
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can read pending announcement pushes'
      using errcode = '42501';
  end if;

  return query
  select
    announcement.id,
    announcement.slug,
    announcement.title,
    announcement.body,
    announcement.path
  from public.feature_announcements as announcement
  where announcement.released_at <= now()
    and announcement.released_at > now() - interval '7 days'
    and announcement.push_attempts < 10
    and (
      announcement.push_status = 'pending'
      or (
        announcement.push_status = 'failed'
        and announcement.push_started_at < now() - interval '1 minute'
      )
      or (
        announcement.push_status = 'sending'
        and announcement.push_started_at < now() - interval '5 minutes'
      )
    )
  order by announcement.released_at;
end;
$$;

-- Tager ét leveringsforsøg. To medlemmer, der åbner appen samtidig, udløser to
-- kald til functionen -- kun det ene får rækken, fordi update'en kun rammer en
-- række, der stadig står som udestående. Returnerer 0, når der intet var at tage.
create function public.claim_feature_announcement_push(announcement_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  claimed_attempt integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can claim announcement pushes'
      using errcode = '42501';
  end if;

  update public.feature_announcements as announcement
  set push_status = 'sending',
      push_attempts = announcement.push_attempts + 1,
      push_started_at = now(),
      push_error = null
  where announcement.id = claim_feature_announcement_push.announcement_id
    and announcement.released_at <= now()
    and announcement.released_at > now() - interval '7 days'
    and announcement.push_attempts < 10
    and (
      announcement.push_status = 'pending'
      or (
        announcement.push_status = 'failed'
        and announcement.push_started_at < now() - interval '1 minute'
      )
      or (
        announcement.push_status = 'sending'
        and announcement.push_started_at < now() - interval '5 minutes'
      )
    )
  returning announcement.push_attempts into claimed_attempt;

  return coalesce(claimed_attempt, 0);
end;
$$;

create function public.complete_feature_announcement_push(
  announcement_id uuid,
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
    raise exception 'Only service role can complete announcement pushes'
      using errcode = '42501';
  end if;

  update public.feature_announcements as announcement
  set push_status = case when succeeded then 'sent' else 'failed' end,
      push_sent_at = case when succeeded then now() else null end,
      push_error = case when succeeded then null else failure_message end
  where announcement.id = complete_feature_announcement_push.announcement_id
    and announcement.push_status = 'sending'
    and announcement.push_attempts = expected_attempt;
end;
$$;

revoke all on function public.pending_feature_announcement_pushes()
  from public, anon, authenticated;
revoke all on function public.claim_feature_announcement_push(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_feature_announcement_push(
  uuid, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.pending_feature_announcement_pushes()
  to service_role;
grant execute on function public.claim_feature_announcement_push(uuid)
  to service_role;
grant execute on function public.complete_feature_announcement_push(
  uuid, integer, boolean, text
) to service_role;

-- Den første nyhed er nyhedsfunktionen selv. Den er samtidig den levende
-- dokumentation af, hvordan de næste skrives: en række pr. funktion, i den
-- migration funktionen alligevel har med.
insert into public.feature_announcements (slug, title, body, path)
values (
  'nyheder-om-nye-funktioner',
  'Du får nu besked, når appen får noget nyt',
  'Nye funktioner dukker op under Nyheder -- og som en notifikation på telefonen, hvis du har slået notifikationer til. Du bestemmer selv på Nyheder-siden, om du vil have dem.',
  'nyheder'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
