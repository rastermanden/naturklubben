-- Administratorer kan moderere billeder på samme vilkår som begivenheder og chat.
-- Hver moderation gemmes som et revisionsspor med snapshots, fordi både billedet
-- og de involverede profiler senere kan blive slettet.
create table public.photo_moderation_log (
  id bigint generated always as identity primary key,
  photo_id uuid not null,
  actor_id uuid not null,
  actor_name text not null,
  uploader_id uuid not null,
  uploader_name text not null,
  caption text,
  storage_path text not null,
  deletion_attempt integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create index photo_moderation_log_requested_at_idx
  on public.photo_moderation_log (requested_at desc);

create unique index photo_moderation_log_pending_attempt_idx
  on public.photo_moderation_log (photo_id, deletion_attempt)
  where status = 'pending';

alter table public.photo_moderation_log enable row level security;

revoke all on table public.photo_moderation_log from anon, authenticated;
grant select on table public.photo_moderation_log to authenticated;

create policy "Admins can read photo moderation log"
  on public.photo_moderation_log for select
  to authenticated
  using (public.is_admin());

drop function public.claim_photo_deletion(uuid, uuid);

create function public.claim_photo_deletion(
  p_photo_id uuid,
  p_user_id uuid
)
returns table (
  claimed_storage_path text,
  claimed_optimized_path text,
  claimed_thumbnail_path text,
  claimed_attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  claimed_photo public.photos%rowtype;
  uploader_name text;
begin
  select *
  into actor_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    return;
  end if;

  update public.photos as photo
  set optimization_status = 'deleting',
      optimization_attempts = photo.optimization_attempts + 1,
      optimization_started_at = now(),
      optimization_completed_at = null,
      optimization_error = null
  where photo.id = p_photo_id
    and (photo.uploaded_by = p_user_id or actor_profile.is_admin)
    and (
      photo.optimization_status not in ('processing', 'deleting')
      or (
        photo.optimization_status in ('processing', 'deleting')
        and (
          photo.optimization_started_at is null
          or photo.optimization_started_at <= now() - interval '10 minutes'
        )
      )
    )
  returning photo.* into claimed_photo;

  if not found then
    return;
  end if;

  update public.photo_moderation_log
  set status = 'failed',
      completed_at = now(),
      error = 'Sletningen blev overhalet af et nyt forsøg.'
  where photo_id = claimed_photo.id
    and deletion_attempt < claimed_photo.optimization_attempts
    and status = 'pending';

  if claimed_photo.uploaded_by <> p_user_id then
    select coalesce(nullif(btrim(full_name), ''), 'Unavngivet medlem')
    into uploader_name
    from public.profiles
    where id = claimed_photo.uploaded_by;

    insert into public.photo_moderation_log (
      photo_id,
      actor_id,
      actor_name,
      uploader_id,
      uploader_name,
      caption,
      storage_path,
      deletion_attempt
    )
    values (
      claimed_photo.id,
      actor_profile.id,
      coalesce(nullif(btrim(actor_profile.full_name), ''), 'Unavngivet medlem'),
      claimed_photo.uploaded_by,
      coalesce(uploader_name, 'Unavngivet medlem'),
      claimed_photo.caption,
      claimed_photo.storage_path,
      claimed_photo.optimization_attempts
    );
  end if;

  return query
  select
    claimed_photo.storage_path,
    claimed_photo.optimized_path,
    claimed_photo.thumbnail_path,
    claimed_photo.optimization_attempts;
end
$$;

revoke all on function public.claim_photo_deletion(uuid, uuid) from public;
grant execute on function public.claim_photo_deletion(uuid, uuid)
  to service_role;

create or replace function public.delete_claimed_photo(
  p_photo_id uuid,
  p_expected_attempt integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  delete from public.photos
  where id = p_photo_id
    and optimization_status = 'deleting'
    and optimization_attempts = p_expected_attempt;

  get diagnostics changed_rows = row_count;

  if changed_rows = 1
     or not exists (
       select 1 from public.photos where id = p_photo_id
     ) then
    update public.photo_moderation_log
    set status = 'completed',
        completed_at = now(),
        error = null
    where photo_id = p_photo_id
      and deletion_attempt = p_expected_attempt
      and status = 'pending';
  end if;

  return changed_rows = 1;
end
$$;

create or replace function public.fail_photo_deletion(
  p_photo_id uuid,
  p_expected_attempt integer,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
  safe_error text := left(
    coalesce(p_error, 'Billedet kunne ikke slettes.'),
    500
  );
begin
  update public.photos
  set optimization_status = 'delete_failed',
      optimization_error = safe_error
  where id = p_photo_id
    and optimization_status = 'deleting'
    and optimization_attempts = p_expected_attempt;

  get diagnostics changed_rows = row_count;

  if changed_rows = 1 then
    update public.photo_moderation_log
    set status = 'failed',
        completed_at = now(),
        error = safe_error
    where photo_id = p_photo_id
      and deletion_attempt = p_expected_attempt
      and status = 'pending';
  elsif not exists (
    select 1 from public.photos where id = p_photo_id
  ) then
    update public.photo_moderation_log
    set status = 'completed',
        completed_at = now(),
        error = null
    where photo_id = p_photo_id
      and deletion_attempt = p_expected_attempt
      and status = 'pending';
  end if;

  return changed_rows = 1;
end
$$;

-- Bevar revisionssporet uden personhenførbare snapshots efter kontosletning.
create or replace function public.cleanup_email_records_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.allowed_emails where email = old.email::citext;
  delete from public.probation_applications where email = old.email::citext;

  if to_regclass('public.admin_role_changes') is not null then
    execute $audit$
      update public.admin_role_changes
      set actor_id = '00000000-0000-0000-0000-000000000000'::uuid,
          actor_name = 'Tidligere medlem'
      where actor_id = $1
    $audit$ using old.id;

    execute $audit$
      update public.admin_role_changes
      set target_id = '00000000-0000-0000-0000-000000000000'::uuid,
          target_name = 'Tidligere medlem'
      where target_id = $1
    $audit$ using old.id;
  end if;

  update public.photo_moderation_log
  set actor_id = '00000000-0000-0000-0000-000000000000'::uuid,
      actor_name = 'Tidligere medlem'
  where actor_id = old.id;

  update public.photo_moderation_log
  set uploader_id = '00000000-0000-0000-0000-000000000000'::uuid,
      uploader_name = 'Tidligere medlem'
  where uploader_id = old.id;

  return old;
end;
$$;
