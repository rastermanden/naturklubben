-- Læsekvitteringer i chatten (#294): man kan se, hvem der har læst hvad.
--
-- Én række pr. medlem pr. rum med den seneste besked, de har læst -- ikke én
-- række pr. besked pr. læser, som ville vokse med hele chathistorikken gange
-- antallet af medlemmer. "Hvem har læst besked X" er så: alle, hvis position
-- ligger på eller efter X. Klienten viser hvert medlems avatar under netop den
-- besked, de senest har læst (som i Messenger).
--
-- Synligheden følger beskederne: det fælles rum for alle indloggede,
-- admin-rummet kun for admins. Der er ingen fravalg -- besluttet i #294.
-- Positionen kan kun flyttes fremad og kun af medlemmet selv, gennem
-- `mark_chat_read`.

create table public.chat_read_positions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  room text not null check (room in ('general', 'admin')),
  -- Beskeden, positionen står på. Slettes beskeden helt, står tidspunktet
  -- tilbage, og klienten placerer avataren ud fra det.
  last_read_message_id uuid references public.messages (id) on delete set null,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, room)
);

create index chat_read_positions_room_idx on public.chat_read_positions (room);

alter table public.chat_read_positions enable row level security;

create policy "Members can read read positions in rooms they can read"
  on public.chat_read_positions for select
  to authenticated
  using (room = 'general' or public.is_admin());

-- ---------------------------------------------------------------------------
-- mark_chat_read
-- ---------------------------------------------------------------------------
-- Sætter kalderens position i beskedens rum til beskeden -- men kun fremad
-- (efter (created_at, id), samme rækkefølge som chatten viser beskederne i).
-- Returnerer intet; et kald, der ville flytte positionen baglæns, er en
-- stille no-op, fordi klienten roligt kan sende en ældre besked, hvis den
-- fx har en forsinket fane åben.
create or replace function public.mark_chat_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.messages%rowtype;
  current_position public.chat_read_positions%rowtype;
begin
  if actor_id is null or not public.account_accepts_writes() then
    raise exception using
      errcode = '42501',
      message = 'chat_read_not_authorized';
  end if;

  select * into target from public.messages where id = p_message_id;

  -- En besked, kalderen ikke kan se (admin-rummet for et almindeligt
  -- medlem), behandles som en, der ikke findes -- så kaldet ikke afslører,
  -- om den er der.
  if not found or (target.room = 'admin' and not public.is_admin()) then
    raise exception using
      errcode = 'P0002',
      message = 'chat_read_message_not_found';
  end if;

  select *
  into current_position
  from public.chat_read_positions
  where user_id = actor_id and room = target.room
  for update;

  if found then
    if (target.created_at, target.id)
      <= (
        current_position.last_read_at,
        coalesce(current_position.last_read_message_id, target.id)
      )
    then
      return;
    end if;

    update public.chat_read_positions
    set last_read_message_id = target.id,
        last_read_at = target.created_at,
        updated_at = now()
    where user_id = actor_id and room = target.room;
  else
    insert into public.chat_read_positions (
      user_id, room, last_read_message_id, last_read_at
    )
    values (actor_id, target.room, target.id, target.created_at);
  end if;
end;
$$;

revoke all on function public.mark_chat_read(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- Eksplicitte grants (#209). Ingen insert/update/delete: al skrivning går
-- gennem mark_chat_read.
grant select on table public.chat_read_positions to authenticated;
grant delete, insert, select, update on table public.chat_read_positions
  to service_role;

-- Avatarerne flytter sig live, ligesom reaktionerne tikker ind live.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_read_positions'
  ) then
    alter publication supabase_realtime add table public.chat_read_positions;
  end if;
end
$$;

insert into public.feature_announcements (slug, title, body, path)
values (
  'chat-laest-af',
  'Nu kan du se, hvem der har læst med i chatten',
  'Under beskederne i chatten står nu små billeder af dem, der har læst så langt. Tryk på dem for at se navnene. Det gælder også dig: de andre kan se, hvor langt du har læst.',
  'chat'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
