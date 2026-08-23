-- Indexes supporting chat history, calendar, and gallery queries (#125).
create index if not exists messages_created_at_id_idx
  on public.messages (created_at desc, id desc);

create index if not exists events_start_at_idx
  on public.events (start_at);

create index if not exists photos_created_at_idx
  on public.photos (created_at desc);

create index if not exists photos_uploaded_by_idx
  on public.photos (uploaded_by);

create index if not exists photos_event_id_idx
  on public.photos (event_id)
  where event_id is not null;
