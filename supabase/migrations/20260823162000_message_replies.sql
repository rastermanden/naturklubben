-- Svar i gruppechatten (#84): en besked kan pege på én tidligere besked.
-- SET NULL bevarer svarene, hvis originalen slettes via den eksisterende policy.
alter table public.messages
  add column reply_to_message_id uuid;

alter table public.messages
  add constraint messages_reply_to_message_id_fkey
    foreign key (reply_to_message_id)
    references public.messages (id)
    on delete set null,
  add constraint messages_cannot_reply_to_self
    check (reply_to_message_id is null or reply_to_message_id <> id);

create index messages_reply_to_message_id_idx
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

-- De eksisterende policies dækker også svar: alle autentificerede kan læse alle
-- beskeder, og afsenderen kan kun indsætte som sig selv. Foreign key'en sikrer,
-- at svaret peger på en besked i det fælles rum. Tabellen er allerede publiceret
-- gennem supabase_realtime, så den nye kolonne følger med INSERT-payloaden.
