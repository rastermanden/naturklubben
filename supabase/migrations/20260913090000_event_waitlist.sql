-- Pladsloft, venteliste og "hvem mangler at svare" på begivenheder (#222).
--
-- En begivenhed kan have et max antal deltagere. Er loftet nået, lander en
-- tilmelding på ventelisten i tilmeldingsrækkefølge, og når en deltager
-- melder afbud, rykker den forreste automatisk op. Et medlem kan også melde
-- afbud, så arrangøren kan se forskel på "kommer ikke" og "har ikke svaret".
--
-- Alle skrivninger i event_attendance går nu gennem respond_to_event: loftet
-- kan kun håndhæves, hvis ingen kan skrive en 'attending'-række uden om
-- tællingen, så tabellens insert/update/delete er trukket tilbage fra
-- API-rollerne. Hvert kald tager en transaktionslås pr. begivenhed, så to
-- samtidige afbud ikke kan rykke to medlemmer op til den samme plads, og to
-- samtidige tilmeldinger ikke begge kan læse "én ledig plads".

alter table public.events
  add column max_participants integer
  constraint events_max_participants_positive
    check (max_participants is null or max_participants > 0);

-- Et svar er ét af tre. Rækkerne fra før er alle tilmeldinger.
alter table public.event_attendance
  add column status text not null default 'attending'
  constraint event_attendance_status_known
    check (status in ('attending', 'waitlisted', 'declined'));

-- Ventelisten rykkes i tilmeldingsrækkefølge; user_id bryder et (usandsynligt)
-- sammenfald i created_at, så rækkefølgen er entydig.
create index event_attendance_waitlist_idx
  on public.event_attendance (event_id, created_at, user_id)
  where status = 'waitlisted';

drop policy if exists "Members can join events as themselves"
  on public.event_attendance;
drop policy if exists "Members can leave their own event attendance"
  on public.event_attendance;

revoke insert, update, delete on table public.event_attendance
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- promote_event_waitlist_locked
-- ---------------------------------------------------------------------------
-- Fylder de ledige pladser med de forreste på ventelisten og returnerer dem,
-- der rykkede op, i rækkefølge. Forudsætter, at kalderen holder begivenhedens
-- lås -- funktionen er kun til de RPC'er nedenfor, som gør det, og kan ikke
-- kaldes fra API'et.
create or replace function public.promote_event_waitlist_locked(
  p_event_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap integer;
  taken integer;
  free_seats integer;
  promoted uuid[];
begin
  select max_participants
  into cap
  from public.events
  where id = p_event_id;

  if not found then
    return '{}'::uuid[];
  end if;

  select count(*)
  into taken
  from public.event_attendance
  where event_id = p_event_id
    and status = 'attending';

  -- Uden loft er der plads til hele ventelisten (den kan kun være ikke-tom,
  -- hvis loftet netop er fjernet). LIMIT NULL betyder "alle".
  free_seats := case
    when cap is null then null
    else greatest(cap - taken, 0)
  end;

  select coalesce(array_agg(user_id order by created_at, user_id), '{}')
  into promoted
  from (
    select user_id, created_at
    from public.event_attendance
    where event_id = p_event_id
      and status = 'waitlisted'
    order by created_at, user_id
    limit free_seats
  ) as next_in_line;

  if cardinality(promoted) = 0 then
    return promoted;
  end if;

  update public.event_attendance
  set status = 'attending'
  where event_id = p_event_id
    and user_id = any (promoted);

  return promoted;
end;
$$;

revoke all on function public.promote_event_waitlist_locked(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- respond_to_event
-- ---------------------------------------------------------------------------
-- Medlemmets svar på en begivenhed: 'attending' (tilmelding -- lander på
-- ventelisten, hvis der er fyldt op), 'declined' (afbud) eller 'none' (træk
-- svaret tilbage). Returnerer den status, svaret endte med, og de medlemmer,
-- svaret rykkede op fra ventelisten -- klienten fortæller dem det i chatten.
create or replace function public.respond_to_event(
  p_event_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
  cap integer;
  taken integer;
  current_status text;
  new_status text;
  promoted uuid[] := '{}';
begin
  if member_id is null or not public.account_accepts_writes() then
    raise exception using
      errcode = '42501',
      message = 'event_response_not_authorized';
  end if;

  if p_response is null
     or p_response not in ('attending', 'declined', 'none') then
    raise exception using
      errcode = '22023',
      message = 'event_response_invalid';
  end if;

  -- Én lås pr. begivenhed, delt med promote_event_waitlist: tælling,
  -- skrivning og oprykning sker bag den, så antallet af deltagere aldrig kan
  -- overstige loftet, og en plads aldrig gives væk to gange.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.event_attendance:' || p_event_id::text, 0
    )
  );

  select max_participants
  into cap
  from public.events
  where id = p_event_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'event_response_event_not_found';
  end if;

  select status
  into current_status
  from public.event_attendance
  where event_id = p_event_id
    and user_id = member_id;

  if p_response = 'none' then
    delete from public.event_attendance
    where event_id = p_event_id
      and user_id = member_id;
    new_status := null;

  elsif p_response = 'declined' then
    if current_status is distinct from 'declined' then
      insert into public.event_attendance (event_id, user_id, status)
      values (p_event_id, member_id, 'declined')
      on conflict (event_id, user_id)
        do update set status = excluded.status, created_at = now();
    end if;
    new_status := 'declined';

  elsif current_status in ('attending', 'waitlisted') then
    -- Allerede tilmeldt: pladsen (eller køpladsen) beholdes som den er.
    new_status := current_status;

  else
    -- Ledige pladser tilhører ventelisten, ikke den nyeste tilmelding. Køen
    -- er normalt tom, når der er plads, men et hævet loft eller en slettet
    -- konto kan efterlade ledige pladser med folk i kø.
    promoted := public.promote_event_waitlist_locked(p_event_id);

    select count(*)
    into taken
    from public.event_attendance
    where event_id = p_event_id
      and status = 'attending';

    new_status := case
      when cap is null or taken < cap then 'attending'
      else 'waitlisted'
    end;

    insert into public.event_attendance (event_id, user_id, status)
    values (p_event_id, member_id, new_status)
    on conflict (event_id, user_id)
      do update set status = excluded.status, created_at = now();
  end if;

  -- Frigav svaret en plads, går den til den forreste på ventelisten.
  if current_status = 'attending' and new_status is distinct from 'attending' then
    promoted := public.promote_event_waitlist_locked(p_event_id);
  end if;

  return jsonb_build_object(
    'status', new_status,
    'promoted', to_jsonb(promoted)
  );
end;
$$;

revoke all on function public.respond_to_event(uuid, text)
  from public, anon;
grant execute on function public.respond_to_event(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- promote_event_waitlist
-- ---------------------------------------------------------------------------
-- Når arrangøren hæver eller fjerner loftet, er der plads til flere fra
-- ventelisten. Klienten kalder den efter at have gemt begivenheden og får de
-- oprykkede tilbage, så den kan sige det i chatten. Kun arrangøren og admins
-- kan ændre loftet, så kun de kan kalde den -- for alle andre er der intet at
-- fortælle, og respond_to_event fylder alligevel pladserne ved næste svar.
create or replace function public.promote_event_waitlist(p_event_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  organiser_id uuid;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'event_waitlist_not_authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.event_attendance:' || p_event_id::text, 0
    )
  );

  select created_by
  into organiser_id
  from public.events
  where id = p_event_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'event_waitlist_event_not_found';
  end if;

  if organiser_id is distinct from auth.uid() and not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'event_waitlist_not_authorized';
  end if;

  return public.promote_event_waitlist_locked(p_event_id);
end;
$$;

revoke all on function public.promote_event_waitlist(uuid)
  from public, anon;
grant execute on function public.promote_event_waitlist(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- event_members_without_response
-- ---------------------------------------------------------------------------
-- Medlemmerne, der hverken er tilmeldt, står på venteliste eller har meldt
-- afbud. Listen er arrangørens og admins' arbejdsredskab til at minde folk
-- om at svare, og den gives ikke til andre: alle kan se, hvem der kommer, men
-- hvem der *ikke* har svaret, er ikke et emne for hele klubben. Kalderen selv
-- udelades -- man ved godt, om man har svaret.
create or replace function public.event_members_without_response(
  p_event_id uuid
)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  organiser_id uuid;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'event_responses_not_authorized';
  end if;

  select created_by
  into organiser_id
  from public.events
  where id = p_event_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'event_responses_event_not_found';
  end if;

  if organiser_id is distinct from auth.uid() and not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'event_responses_not_authorized';
  end if;

  return query
    select member.id
    from public.profiles as member
    where member.id <> auth.uid()
      and not exists (
        select 1
        from public.event_attendance as response
        where response.event_id = p_event_id
          and response.user_id = member.id
      )
    order by member.full_name nulls last, member.id;
end;
$$;

revoke all on function public.event_members_without_response(uuid)
  from public, anon;
grant execute on function public.event_members_without_response(uuid)
  to authenticated;

insert into public.feature_announcements (slug, title, body, path)
values (
  'kalender-venteliste',
  'Pladsloft og venteliste på ture',
  'En tur kan nu have et max antal deltagere. Er der fyldt op, kommer du på venteliste og rykker automatisk op, når nogen melder afbud -- så får du besked i chatten. Du kan også melde afbud, så arrangøren ved, du ikke kommer, og arrangøren kan minde dem, der endnu ikke har svaret.',
  'kalender'
)
on conflict (slug) do nothing;
