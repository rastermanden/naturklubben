-- Mentions i chatten og notifikationspræference pr. medlem (#179).
--
-- Mentions gemmes som bruger-id'er direkte på beskeden:
--   * ikke som tekst, fordi danske navne har mellemrum ("Martin Jensen"), og
--     fordi et navneskift ellers ville efterlade en død mention. Id'et er
--     stabilt, og visningen slår det aktuelle navn op i profil-kortet.
--   * ikke i en join-tabel, fordi det ville være en ekstra RLS-flade for et
--     felt, kun afsenderen skriver -- og kun i samme sætning som beskeden.
--
-- Skriveadgangen følger derfor beskedens egen: insert-policyen kræver
-- auth.uid() = user_id, og update/delete er trukket tilbage fra authenticated
-- (#107). Ingen kan altså sætte mentions på en andens besked.
alter table public.messages
  add column mentions uuid[] not null default '{}';

alter table public.messages
  add constraint messages_mentions_check
  check (
    (array_length(mentions, 1) is null or array_length(mentions, 1) <= 20)
    and array_position(mentions, null) is null
  );

-- En slettet besked har intet indhold tilbage at fremhæve i, så den skal
-- heller ikke blive ved med at pege på de nævnte.
create or replace function public.soft_delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_message public.messages%rowtype;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'message_delete_not_authorized';
  end if;

  select *
  into target_message
  from public.messages
  where id = p_message_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'message_delete_not_found';
  end if;

  if target_message.deleted_at is not null then
    return;
  end if;

  if target_message.user_id is distinct from actor_id
     and not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'message_delete_not_authorized';
  end if;

  update public.messages
  set content = '',
      mentions = '{}',
      deleted_at = now(),
      deleted_by = actor_id
  where id = p_message_id;
end;
$$;

-- Notifikationspræferencen hører til personen, ikke til installationen: valget
-- skal gælde alle medlemmets enheder, så det ligger på profilen og ikke på
-- push_subscriptions. Filtreringen sker server-side i chat-push.
alter table public.profiles
  add column chat_notification_preference text not null default 'all'
  check (chat_notification_preference in ('all', 'mentions', 'none'));

-- Tabel-update er trukket tilbage fra authenticated (#96), så profilens
-- redigerbare felter er en eksplicit kolonneliste. Uden den her ville valget
-- kun kunne læses, ikke sættes.
grant update (chat_notification_preference)
  on table public.profiles
  to authenticated;

-- Søgning og beskedkontekst returnerer en eksplicit kolonneliste, og
-- get_chat_message_context erstatter hele beskedlisten i klienten -- uden
-- mentions her ville en besked, man åbnede fra søgningen, tabe sin fremhævning.
-- RETURNS TABLE-listen er en del af signaturen, så funktionerne må droppes og
-- genskabes (samme grund som i #163).
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
