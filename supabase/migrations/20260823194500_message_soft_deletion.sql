-- Irreversible soft deletion for chat messages (#107).
alter table public.messages
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete set null;

alter table public.messages
  drop constraint if exists messages_content_check;

alter table public.messages
  add constraint messages_content_state_check
  check (
    (
      deleted_at is null
      and deleted_by is null
      and char_length(content) between 1 and 2000
    )
    or (
      deleted_at is not null
      and content = ''
    )
  );

-- Clients must not edit or hard-delete messages directly. The RPC below is the
-- only deletion path and can only clear the three deletion-owned fields.
drop policy if exists "Owners can delete own messages" on public.messages;
drop policy if exists "Admins can delete any message" on public.messages;
revoke update, delete on table public.messages from anon, authenticated;

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
      deleted_at = now(),
      deleted_by = actor_id
  where id = p_message_id;
end;
$$;

revoke all on function public.soft_delete_message(uuid)
  from public, anon, authenticated;
grant execute on function public.soft_delete_message(uuid) to authenticated;
