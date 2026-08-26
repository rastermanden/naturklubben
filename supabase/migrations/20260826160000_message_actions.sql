-- "/slap"-kommandoen i chatten (#163): en handlingsbesked ("* Navn slår Bob
-- rundt med en stor ørred") skal vises uden afsenderboble, i modsætning til
-- en almindelig besked. Kolonnen lader klienten skelne visningsformerne
-- server-side i stedet for at gætte det ud fra indholdet.
alter table public.messages
  add column message_type text not null default 'text'
  check (message_type in ('text', 'action'));

-- RETURNS TABLE-listen udvides med message_type, hvilket create or replace
-- ikke tillader på en eksisterende funktion (kolonnesættet regnes som en del
-- af signaturen) -- funktionerne må derfor droppes og genskabes.
drop function if exists public.search_chat_messages(
  text, timestamptz, uuid, integer
);
drop function if exists public.get_chat_message_context(uuid, integer);

create function public.search_chat_messages(
  search_query text,
  before_created_at timestamptz default null,
  before_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  message_type text,
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
    and to_tsvector('danish', message.content)
      @@ websearch_to_tsquery('danish', search_query)
    and (
      before_created_at is null
      or (message.created_at, message.id) < (before_created_at, before_id)
    )
  order by message.created_at desc, message.id desc
  limit least(greatest(page_size, 1), 100)
$$;

create function public.get_chat_message_context(
  target_message_id uuid,
  context_size integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  message_type text,
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
    select message.created_at, message.id
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
    ) as has_more_older
  from bounded_context as message
  left join public.messages as parent
    on parent.id = message.reply_to_message_id
  order by message.created_at, message.id
$$;

revoke execute on function public.search_chat_messages(
  text, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.search_chat_messages(
  text, timestamptz, uuid, integer
) to authenticated;

revoke execute on function public.get_chat_message_context(
  uuid, integer
) from public, anon;
grant execute on function public.get_chat_message_context(
  uuid, integer
) to authenticated;
