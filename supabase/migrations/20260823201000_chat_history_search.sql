-- Server-side search and keyset-friendly context loading for chat history (#106).
create index if not exists messages_content_search_idx
  on public.messages
  using gin (to_tsvector('danish', content))
  where deleted_at is null;

create or replace function public.search_chat_messages(
  search_query text,
  before_created_at timestamptz default null,
  before_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  content text,
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

create or replace function public.get_chat_message_context(
  target_message_id uuid,
  context_size integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  content text,
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
