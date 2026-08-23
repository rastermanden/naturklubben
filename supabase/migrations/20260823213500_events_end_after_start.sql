do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_end_after_start'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_end_after_start
      check (end_at is null or end_at >= start_at);
  end if;
end
$$;
