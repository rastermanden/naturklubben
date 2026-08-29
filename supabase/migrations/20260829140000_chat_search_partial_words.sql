-- Chatsøgningen gav i praksis aldrig træffere (#183).
--
-- Søgningen var ren fuldtekstsøgning: `to_tsvector('danish', content)` mod
-- `websearch_to_tsquery('danish', term)`. Fuldtekst matcher *hele, stammede
-- ord* -- aldrig ordstumper. Feltet søger ved hvert tastetryk, så man skriver
-- "s", "sk", "sko", "skov"... og får "Ingen beskeder fundet" hele vejen; kun
-- hvis man rammer præcis det rigtige hele ord ("skovsøen"), tænder et
-- resultat. Navne og bøjninger, stammeren ikke kender, tændte aldrig, og et
-- stopord ("det", "og") giver en tom tsquery, der pr. definition matcher nul
-- rækker.
--
-- Derfor matches der nu på delstrenge *ud over* fuldtekst: fuldtekst tager
-- stammede ord i vilkårlig rækkefølge ("vejr godt" finder "godt vejr"), og
-- delstrengen tager ordstumper, navne, stopord og halvskrevne sætninger
-- ("mødes ved skovs"). Sammen dækker de det, folk faktisk taster.
do $$
declare
  opclass_schema text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create extension pg_trgm with schema extensions;
  end if;

  -- pg_trgm ligger i `extensions` på Supabase, men kan ligge i public i en
  -- ældre database. Operatorklassen slås derfor op frem for at hardkodes.
  select namespace.nspname
    into opclass_schema
  from pg_opclass as opclass
  join pg_namespace as namespace on namespace.oid = opclass.opcnamespace
  join pg_am as access_method on access_method.oid = opclass.opcmethod
  where opclass.opcname = 'gin_trgm_ops'
    and access_method.amname = 'gin'
  limit 1;

  if opclass_schema is null then
    raise exception 'gin_trgm_ops findes ikke -- pg_trgm blev ikke installeret';
  end if;

  -- Uden trigram-indekset ville delstrengssøgningen scanne hele
  -- beskedtabellen ved hvert tastetryk.
  execute format(
    'create index if not exists messages_content_trgm_idx
       on public.messages using gin (content %I.gin_trgm_ops)
       where deleted_at is null',
    opclass_schema
  );
end
$$;

-- Kolonnelisten er uændret siden #179, så funktionen kan erstattes i stedet
-- for at droppes og genskabes.
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

revoke execute on function public.search_chat_messages(
  text, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.search_chat_messages(
  text, timestamptz, uuid, integer
) to authenticated;
