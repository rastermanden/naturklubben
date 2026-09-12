-- Admin-chatrum (#212): et rum, kun administratorer kan se og skrive i, med
-- samme funktioner som den fælles chat.
--
-- Løsningen genbruger `messages`-tabellen med en `room`-kolonne i stedet for
-- en ny tabel. Svar, reaktioner, mentions, søgning, sletning og
-- slash-kommandoer er allerede bygget oven på `messages`, og de skal virke
-- ens i begge rum -- det holdes ved at være samme skema og samme funktioner,
-- ikke en parallel kopi af dem.
alter table public.messages
  add column room text not null default 'general'
  check (room in ('general', 'admin'));

-- Beskedhentningen filtrerer altid på rum og sorterer efter created_at/id,
-- så indekset dækker begge dele. `where deleted_at is null` matcher den
-- eneste måde, klienten henter historik på.
create index messages_room_created_at_idx
  on public.messages (room, created_at desc, id desc)
  where deleted_at is null;

-- Det fælles rum ('general') er uændret åbent for alle autentificerede.
-- Admin-rummet kræver profiles.is_admin, både til læsning og afsendelse.
drop policy "Authenticated can read messages" on public.messages;
create policy "Authenticated can read messages"
  on public.messages for select
  to authenticated
  using (room = 'general' or public.is_admin());

drop policy "Authenticated can send messages" on public.messages;
create policy "Authenticated can send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (room = 'general' or public.is_admin())
  );

-- Reaktioner har intet rum af sig selv -- de arver synligheden fra beskeden,
-- de sidder på, så en reaktion i admin-rummet er lige så skjult for
-- almindelige medlemmer som selve beskeden.
drop policy "Authenticated can read reactions" on public.message_reactions;
create policy "Authenticated can read reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages as message
      where message.id = message_reactions.message_id
        and (message.room = 'general' or public.is_admin())
    )
  );

drop policy "Members can add own reactions" on public.message_reactions;
create policy "Members can add own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages as message
      where message.id = message_reactions.message_id
        and (message.room = 'general' or public.is_admin())
    )
  );

-- get_chat_message_context slår selv target-beskedens rum op og bruger det
-- til at afgrænse konteksten -- intet nyt parameter nødvendigt, så
-- funktionen kan bare erstattes. RLS'en ovenfor sørger for, at et
-- ikke-admin-kald med et target-id fra admin-rummet ikke finder nogen target
-- og derfor ikke returnerer noget som helst.
create or replace function public.get_chat_message_context(
  target_message_id uuid,
  context_size integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  message_type text,
  mentions uuid[],
  created_at timestamptz,
  reply_to_message_id uuid,
  reply_to jsonb,
  has_more_older boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select message.created_at, message.id, message.room
    from public.messages as message
    where message.id = target_message_id
      and message.deleted_at is null
  ),
  context_messages as (
    (
      select message.*
      from public.messages as message
      cross join target
      where (message.created_at, message.id)
        <= (target.created_at, target.id)
        and message.deleted_at is null
        and message.room = target.room
      order by message.created_at desc, message.id desc
      limit least(greatest(context_size, 1), 100) + 1
    )
    union
    (
      select message.*
      from public.messages as message
      cross join target
      where (message.created_at, message.id)
        > (target.created_at, target.id)
        and message.deleted_at is null
        and message.room = target.room
      order by message.created_at, message.id
      limit least(greatest(context_size, 1), 100)
    )
  ),
  bounded_context as (
    select context_messages.*
    from context_messages
    order by created_at desc, id desc
    limit (least(greatest(context_size, 1), 100) * 2) + 1
  )
  select
    message.id,
    message.user_id,
    message.content,
    message.message_type,
    message.mentions,
    message.created_at,
    message.reply_to_message_id,
    case
      when parent.id is null then null
      else jsonb_build_object(
        'id', parent.id,
        'user_id', parent.user_id,
        'content', parent.content,
        'deleted_at', parent.deleted_at,
        'deleted_by', parent.deleted_by
      )
    end as reply_to,
    exists (
      select 1
      from public.messages as older
      where (older.created_at, older.id)
        < (message.created_at, message.id)
        and older.deleted_at is null
        and older.room = message.room
    ) as has_more_older
  from bounded_context as message
  left join public.messages as parent
    on parent.id = message.reply_to_message_id
  order by message.created_at, message.id
$$;

-- search_chat_messages får derimod et nyt rum-parameter: søgning har intet
-- target-id at slå rummet op fra, klienten skal selv sige, hvilket rum den
-- søger i. Et ekstra parameter er en anden signatur, så funktionen må droppes
-- og genskabes (samme grund som i #163 og #179). Defaulten holder eksisterende
-- kald mod det fælles rum uændrede.
drop function if exists public.search_chat_messages(
  text, timestamptz, uuid, integer
);

create function public.search_chat_messages(
  search_query text,
  before_created_at timestamptz default null,
  before_id uuid default null,
  page_size integer default 20,
  p_room text default 'general'
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  message_type text,
  mentions uuid[],
  created_at timestamptz,
  reply_to_message_id uuid,
  reply_to jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    message.id,
    message.user_id,
    message.content,
    message.message_type,
    message.mentions,
    message.created_at,
    message.reply_to_message_id,
    case
      when parent.id is null then null
      else jsonb_build_object(
        'id', parent.id,
        'user_id', parent.user_id,
        'content', parent.content,
        'deleted_at', parent.deleted_at,
        'deleted_by', parent.deleted_by
      )
    end as reply_to
  from public.messages as message
  left join public.messages as parent
    on parent.id = message.reply_to_message_id
  where nullif(btrim(search_query), '') is not null
    and message.deleted_at is null
    and message.room = p_room
    and to_tsvector('danish', message.content)
      @@ websearch_to_tsquery('danish', search_query)
    and (
      before_created_at is null
      or (message.created_at, message.id) < (before_created_at, before_id)
    )
  order by message.created_at desc, message.id desc
  limit least(greatest(page_size, 1), 100)
$$;

revoke execute on function public.search_chat_messages(
  text, timestamptz, uuid, integer, text
) from public, anon;
grant execute on function public.search_chat_messages(
  text, timestamptz, uuid, integer, text
) to authenticated;

revoke execute on function public.get_chat_message_context(
  uuid, integer
) from public, anon;
grant execute on function public.get_chat_message_context(
  uuid, integer
) to authenticated;
