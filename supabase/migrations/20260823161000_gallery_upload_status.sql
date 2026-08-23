-- Persistent image-optimization status for gallery uploads (#89).
--
-- The original upload is owned by the browser queue. Once a photos row exists,
-- optimization status lives here so it survives reloads and can be retried safely.

alter table public.photos
  add column optimization_status text not null default 'pending',
  add column optimization_attempts integer not null default 0,
  add column optimization_started_at timestamptz,
  add column optimization_completed_at timestamptz,
  add column optimization_error text,
  add constraint photos_optimization_status_check
    check (
      optimization_status in (
        'pending',
        'processing',
        'ready',
        'failed',
        'deleting',
        'delete_failed'
      )
    ),
  add constraint photos_optimization_attempts_check
    check (optimization_attempts >= 0),
  add constraint photos_ready_has_outputs_check
    check (
      optimization_status <> 'ready'
      or (optimized_path is not null and thumbnail_path is not null)
    );

-- Existing rows predate explicit status. Complete outputs are ready; incomplete
-- rows become retryable failures rather than appearing to process forever.
update public.photos
set optimization_status = case
      when optimized_path is not null and thumbnail_path is not null then 'ready'
      else 'failed'
    end,
    optimization_completed_at = case
      when optimized_path is not null and thumbnail_path is not null then created_at
      else null
    end,
    optimization_error = case
      when optimized_path is null or thumbnail_path is null
        then 'Billedet blev uploadet før sikker optimeringsstatus blev indført.'
      else null
    end;

-- Optimization fields and output paths are server-owned. Authenticated clients
-- create metadata through the narrow RPC below and cannot forge processing state.
drop policy if exists "Authenticated can upload photos" on public.photos;
drop policy if exists "Owners can update own photos" on public.photos;
drop policy if exists "Owners can delete own photos" on public.photos;
revoke insert, update, delete on public.photos from authenticated;

create or replace function public.upsert_photo_upload(
  p_photo_id uuid,
  p_storage_path text,
  p_caption text,
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_storage_path !~ (
    '^'
    || auth.uid()::text
    || '/'
    || p_photo_id::text
    || '[.][a-z0-9]{1,10}$'
  ) then
    raise exception 'Invalid photo storage path' using errcode = '22023';
  end if;

  insert into public.photos (
    id,
    storage_path,
    caption,
    event_id,
    uploaded_by
  )
  values (
    p_photo_id,
    p_storage_path,
    nullif(btrim(p_caption), ''),
    p_event_id,
    auth.uid()
  )
  on conflict (id) do update
  set caption = excluded.caption,
      event_id = excluded.event_id
  where photos.uploaded_by = auth.uid()
    and photos.storage_path = excluded.storage_path
  returning photos.id into saved_id;

  if saved_id is null then
    raise exception 'Photo upload conflicts with an existing row'
      using errcode = '42501';
  end if;

  return saved_id;
end
$$;

revoke all on function public.upsert_photo_upload(uuid, text, text, uuid)
  from public;
grant execute on function public.upsert_photo_upload(uuid, text, text, uuid)
  to authenticated;

-- One UPDATE ... RETURNING owns the transition and attempt increment. The
-- verified user id is supplied only by optimize-image, using the service role.
create or replace function public.claim_photo_optimization(
  p_photo_id uuid,
  p_user_id uuid
)
returns table (claimed_storage_path text, claimed_attempt integer)
language sql
security definer
set search_path = public
as $$
  update public.photos
  set optimization_status = 'processing',
      optimization_attempts = optimization_attempts + 1,
      optimization_started_at = now(),
      optimization_completed_at = null,
      optimization_error = null
  where id = p_photo_id
    and uploaded_by = p_user_id
    and (
      optimization_status in ('pending', 'failed')
      or (
        optimization_status = 'processing'
        and (
          optimization_started_at is null
          or optimization_started_at <= now() - interval '10 minutes'
        )
      )
    )
  returning storage_path, optimization_attempts
$$;

revoke all on function public.claim_photo_optimization(uuid, uuid) from public;
grant execute on function public.claim_photo_optimization(uuid, uuid)
  to service_role;

-- Both success and failure are fenced by the same attempt. A worker that
-- finishes after a newer retry therefore changes zero rows.
create or replace function public.complete_photo_optimization(
  p_photo_id uuid,
  p_expected_attempt integer,
  p_succeeded boolean,
  p_optimized_path text,
  p_thumbnail_path text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  if p_succeeded
    and (p_optimized_path is null or p_thumbnail_path is null) then
    raise exception 'Successful optimization requires both output paths'
      using errcode = '22023';
  end if;

  update public.photos
  set optimized_path = case
        when p_succeeded then p_optimized_path
        else optimized_path
      end,
      thumbnail_path = case
        when p_succeeded then p_thumbnail_path
        else thumbnail_path
      end,
      optimization_status = case
        when p_succeeded then 'ready'
        else 'failed'
      end,
      optimization_completed_at = case
        when p_succeeded then now()
        else null
      end,
      optimization_error = case
        when p_succeeded then null
        else left(coalesce(p_error, 'Billedet kunne ikke optimeres.'), 500)
      end
  where id = p_photo_id
    and optimization_status = 'processing'
    and optimization_attempts = p_expected_attempt;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end
$$;

revoke all on function public.complete_photo_optimization(
  uuid, integer, boolean, text, text, text
) from public;
grant execute on function public.complete_photo_optimization(
  uuid, integer, boolean, text, text, text
) to service_role;

-- Deletion uses the same row lock as an optimization claim. Fresh workers win
-- and must finish first; stale workers are fenced by the incremented attempt.
create or replace function public.claim_photo_deletion(
  p_photo_id uuid,
  p_user_id uuid
)
returns table (
  claimed_storage_path text,
  claimed_optimized_path text,
  claimed_thumbnail_path text,
  claimed_attempt integer
)
language sql
security definer
set search_path = public
as $$
  update public.photos
  set optimization_status = 'deleting',
      optimization_attempts = optimization_attempts + 1,
      optimization_started_at = now(),
      optimization_completed_at = null,
      optimization_error = null
  where id = p_photo_id
    and uploaded_by = p_user_id
    and (
      optimization_status not in ('processing', 'deleting')
      or (
        optimization_status in ('processing', 'deleting')
        and (
          optimization_started_at is null
          or optimization_started_at <= now() - interval '10 minutes'
        )
      )
    )
  returning
    storage_path,
    optimized_path,
    thumbnail_path,
    optimization_attempts
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
set search_path = public
as $$
declare
  changed_rows integer;
begin
  delete from public.photos
  where id = p_photo_id
    and optimization_status = 'deleting'
    and optimization_attempts = p_expected_attempt;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end
$$;

revoke all on function public.delete_claimed_photo(uuid, integer) from public;
grant execute on function public.delete_claimed_photo(uuid, integer)
  to service_role;

create or replace function public.fail_photo_deletion(
  p_photo_id uuid,
  p_expected_attempt integer,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  update public.photos
  set optimization_status = 'delete_failed',
      optimization_error = left(
        coalesce(p_error, 'Billedet kunne ikke slettes.'),
        500
      )
  where id = p_photo_id
    and optimization_status = 'deleting'
    and optimization_attempts = p_expected_attempt;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end
$$;

revoke all on function public.fail_photo_deletion(uuid, integer, text)
  from public;
grant execute on function public.fail_photo_deletion(uuid, integer, text)
  to service_role;

-- Storage upsert performs UPDATE when a retry reaches a path that the first
-- uncertain request already created. Keep that ability inside the owner's folder.
drop policy if exists "Authenticated can upload original photos"
  on storage.objects;
create policy "Authenticated can upload original photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- En Preview Branch kan have fået samme policy fra en parallel, senere
-- migration, før denne migration backfilles efter en rebase.
drop policy if exists "Owners can update own original photos"
  on storage.objects;
create policy "Owners can update own original photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners can delete own original photos"
  on storage.objects;

-- Realtime is the primary path for function status updates. The client also
-- polls briefly while work is active, so delayed channel delivery is harmless.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;
end
$$;
