-- Afstemninger i chatten (#217): en gruppe kan hurtigt afgøre "hvor skal vi
-- hen på lørdag?" uden at tælle reaktioner i hånden.
--
-- Afstemningsbeskeden er en helt almindelig række i `messages` -- klienten
-- indsætter den, som den ville indsætte enhver anden besked, med spørgsmålet
-- som `content`. Søgning, sletning og eksport rører derfor ingenting nyt: de
-- kender allerede `messages`. Det, der er nyt, er en tabel med selve
-- afstemningen (ét-til-ét med beskeden), en med dens svarmuligheder og en med
-- medlemmernes stemmer -- alle tre kun skrivbare gennem
-- `security definer`-RPC'er, efter samme mønster som resten af chatten
-- (`soft_delete_message`) og som `respond_to_event` i #222.

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  -- Én afstemning pr. besked -- beskeden *er* afstemningen, set fra en
  -- afsenders og en læsers side.
  message_id uuid not null unique references public.messages (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  -- Samme mønster som messages.user_id (#99): kontosletning nulstiller
  -- ophavet i stedet for at fjerne afstemningen, så de andres stemmer består.
  created_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint polls_closed_by_requires_closed_at check (
    (closed_at is null) = (closed_by is null)
  )
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  -- 0-baseret, i den rækkefølge svarene blev skrevet i kommandoen. Bruges
  -- både til at vise svarene i den rækkefølge og til at håndhæve 2-6 svar.
  position smallint not null check (position between 0 and 5),
  label text not null check (char_length(label) between 1 and 200),
  unique (poll_id, position)
);

-- Én stemme pr. medlem pr. afstemning: primærnøglen er (poll_id, user_id),
-- ikke et selvstændigt id -- en ny stemme kan derfor kun *erstatte* den gamle
-- (samme (poll_id, user_id)-par), aldrig ligge ved siden af den.
create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- Opslaget går altid "alle stemmer for denne afstemning"; primærnøglens
-- indeks har poll_id først og dækker derfor allerede det -- et selvstændigt
-- indeks ville, som i message_reactions, kun være dødvægt ved skrivning.

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- Synligheden følger beskeden, afstemningen hænger på -- præcis som
-- message_reactions følger beskeden, den sidder på (#212): det fælles rum er
-- åbent for alle autentificerede, admin-rummet kun for admins. Der er bevidst
-- ingen insert/update/delete-policy på nogen af de tre tabeller -- al
-- skrivning går gennem RPC'erne nedenfor, som er security definer og derfor
-- ikke selv er underlagt RLS.
create policy "Authenticated can read polls"
  on public.polls for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages as message
      where message.id = polls.message_id
        and (message.room = 'general' or public.is_admin())
    )
  );

create policy "Authenticated can read poll options"
  on public.poll_options for select
  to authenticated
  using (
    exists (
      select 1
      from public.polls as poll
      join public.messages as message on message.id = poll.message_id
      where poll.id = poll_options.poll_id
        and (message.room = 'general' or public.is_admin())
    )
  );

-- Afstemninger er ikke anonyme (jf. #217's afgrænsning): alle, der kan se
-- afstemningen, kan se, hvem der stemte hvad -- samme synlighed som
-- reaktioner, som allerede viser navne.
create policy "Authenticated can read poll votes"
  on public.poll_votes for select
  to authenticated
  using (
    exists (
      select 1
      from public.polls as poll
      join public.messages as message on message.id = poll.message_id
      where poll.id = poll_votes.poll_id
        and (message.room = 'general' or public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- create_poll
-- ---------------------------------------------------------------------------
-- Opretter afstemningen og dens svarmuligheder på en besked, afsenderen selv
-- ejer. Klienten sender selve beskeden som en helt almindelig besked (med
-- spørgsmålet som content) og kalder derefter denne RPC med besked-id'et og
-- svarene -- to kald, ikke ét, præcis fordi beskeden ikke er andet end en
-- besked. Returnerer afstemningen som jsonb, så den kaldende klient kan vise
-- den med det samme uden at vente på Realtime.
create or replace function public.create_poll(
  p_message_id uuid,
  p_options text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_message public.messages%rowtype;
  new_poll_id uuid;
  option_count integer := coalesce(array_length(p_options, 1), 0);
  option_label text;
  option_position smallint := 0;
  result jsonb;
begin
  if actor_id is null or not public.account_accepts_writes() then
    raise exception using
      errcode = '42501',
      message = 'poll_create_not_authorized';
  end if;

  select *
  into target_message
  from public.messages
  where id = p_message_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'poll_create_message_not_found';
  end if;

  if target_message.user_id is distinct from actor_id then
    raise exception using
      errcode = '42501',
      message = 'poll_create_not_authorized';
  end if;

  if target_message.deleted_at is not null then
    raise exception using
      errcode = '22023',
      message = 'poll_create_message_deleted';
  end if;

  if option_count < 2 or option_count > 6 then
    raise exception using
      errcode = '22023',
      message = 'poll_create_invalid_options';
  end if;

  foreach option_label in array p_options loop
    if nullif(btrim(option_label), '') is null then
      raise exception using
        errcode = '22023',
        message = 'poll_create_invalid_options';
    end if;
  end loop;

  insert into public.polls (message_id, question, created_by)
  values (p_message_id, target_message.content, actor_id)
  returning id into new_poll_id;

  foreach option_label in array p_options loop
    insert into public.poll_options (poll_id, position, label)
    values (new_poll_id, option_position, btrim(option_label));
    option_position := option_position + 1;
  end loop;

  select jsonb_build_object(
    'id', poll.id,
    'message_id', poll.message_id,
    'question', poll.question,
    'created_by', poll.created_by,
    'closed_at', poll.closed_at,
    'closed_by', poll.closed_by,
    'options', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'poll_id', option.poll_id,
          'position', option.position,
          'label', option.label
        )
        order by option.position
      ), '[]'::jsonb)
      from public.poll_options as option
      where option.poll_id = poll.id
    ),
    'votes', '[]'::jsonb
  )
  into result
  from public.polls as poll
  where poll.id = new_poll_id;

  return result;
end;
$$;

revoke all on function public.create_poll(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.create_poll(uuid, text[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- cast_poll_vote
-- ---------------------------------------------------------------------------
-- Ét kald dækker både "stem" og "stem om": (poll_id, user_id) er
-- primærnøglen på poll_votes, så en ny stemme erstatter den gamle i stedet
-- for at ligge ved siden af den.
create or replace function public.cast_poll_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_poll public.polls%rowtype;
  option_belongs boolean;
  can_read boolean;
begin
  if actor_id is null or not public.account_accepts_writes() then
    raise exception using
      errcode = '42501',
      message = 'poll_vote_not_authorized';
  end if;

  select *
  into target_poll
  from public.polls
  where id = p_poll_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'poll_vote_not_found';
  end if;

  -- Synligheden er den samme, select-policyen håndhæver for alle andre --
  -- her tjekket i hånden, fordi security definer-funktionen ikke selv er
  -- underlagt RLS. Et medlem uden adgang til beskedens rum (fx admin-rummet)
  -- kan derfor ikke stemme, selv hvis id'et på en eller anden måde er kendt.
  select exists (
    select 1
    from public.messages as message
    where message.id = target_poll.message_id
      and (message.room = 'general' or public.is_admin())
  )
  into can_read;

  if not can_read then
    raise exception using
      errcode = '42501',
      message = 'poll_vote_not_authorized';
  end if;

  if target_poll.closed_at is not null then
    raise exception using
      errcode = '55000',
      message = 'poll_vote_closed';
  end if;

  select exists (
    select 1
    from public.poll_options
    where id = p_option_id
      and poll_id = p_poll_id
  )
  into option_belongs;

  if not option_belongs then
    raise exception using
      errcode = '22023',
      message = 'poll_vote_unknown_option';
  end if;

  insert into public.poll_votes (poll_id, user_id, option_id)
  values (p_poll_id, actor_id, p_option_id)
  on conflict (poll_id, user_id)
    do update set option_id = excluded.option_id, created_at = now();
end;
$$;

revoke all on function public.cast_poll_vote(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cast_poll_vote(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- close_poll
-- ---------------------------------------------------------------------------
-- Kun opretteren eller en admin kan lukke -- samme regel som
-- soft_delete_message bruger for hvem der må slette en besked. Lukning er
-- idempotent: at lukke en allerede lukket afstemning ændrer ikke
-- closed_at/closed_by igen.
create or replace function public.close_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_poll public.polls%rowtype;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'poll_close_not_authorized';
  end if;

  select *
  into target_poll
  from public.polls
  where id = p_poll_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'poll_close_not_found';
  end if;

  if target_poll.closed_at is not null then
    return;
  end if;

  if target_poll.created_by is distinct from actor_id
     and not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'poll_close_not_authorized';
  end if;

  update public.polls
  set closed_at = now(),
      closed_by = actor_id
  where id = p_poll_id;
end;
$$;

revoke all on function public.close_poll(uuid)
  from public, anon, authenticated;
grant execute on function public.close_poll(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Grants (#209): nye tabeller er lukkede for API-rollerne som standard i et
-- nyt projekt (og dermed i CI's platformsbootstrap og i hver Preview
-- Branch), så migrationen skal selv skrive dem eksplicit -- de kommer ikke
-- fra platformens standardrettigheder.
-- ---------------------------------------------------------------------------
grant select on table public.polls to authenticated;
grant select on table public.poll_options to authenticated;
grant select on table public.poll_votes to authenticated;
grant delete, insert, select, update on table public.polls to service_role;
grant delete, insert, select, update on table public.poll_options to service_role;
grant delete, insert, select, update on table public.poll_votes to service_role;

-- Afstemninger skal opdatere sig selv live, uden genindlæsning -- samme
-- publikation som beskeder og reaktioner.
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_options;
alter publication supabase_realtime add table public.poll_votes;

insert into public.feature_announcements (slug, title, body, path)
values (
  'afstemninger-i-chatten',
  'Afstemninger i chatten',
  'Skriv /afstemning <spørgsmål> | <svar 1> | <svar 2> i chatten for at lave en afstemning -- fx "hvor skal vi hen på lørdag?". Alle kan stemme med det samme, og stemmerne tælles op live. Opretteren kan lukke afstemningen, når resultatet er klart.',
  'chat'
)
on conflict (slug) do nothing;
