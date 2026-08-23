alter table public.events
  add constraint events_end_after_start
  check (end_at is null or end_at >= start_at);
