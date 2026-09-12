-- Admin-chatrummet (#212) gav search_chat_messages et rum-parameter, men
-- genskabte funktionen ud fra den rene fuldtekstsøgning fra før #183 -- så
-- ordstumper, stopord og halvskrevne sætninger holdt igen op med at give
-- træffere, og pgTAP-testen 50_chat_search.sql blev rød på main.
--
-- Her lægges delstrengssøgningen fra 20260829140000 tilbage oven på den nye
-- signatur. Signaturen er uændret, så funktionen kan erstattes på stedet.
create or replace function public.search_chat_messages(
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
  with needle as (
    select nullif(btrim(search_query), '') as term
  ),
  matcher as (
    select
      websearch_to_tsquery('danish', needle.term) as ts_query,
      -- `%` og `_` er jokertegn i ilike; en søgning efter "50%" skal lede
      -- efter teksten "50%", ikke efter "50" efterfulgt af hvad som helst.
      '%' || replace(
        replace(replace(needle.term, '\', '\\'), '%', '\%'),
        '_',
        '\_'
      ) || '%' as substring_pattern
    from needle
    where needle.term is not null
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
    end as reply_to
  from public.messages as message
  cross join matcher
  left join public.messages as parent
    on parent.id = message.reply_to_message_id
  where message.deleted_at is null
    and message.room = p_room
    and (
      to_tsvector('danish', message.content) @@ matcher.ts_query
      or message.content ilike matcher.substring_pattern
    )
    and (
      before_created_at is null
      or (message.created_at, message.id) < (before_created_at, before_id)
    )
  order by message.created_at desc, message.id desc
  limit least(greatest(page_size, 1), 100)
$$;
