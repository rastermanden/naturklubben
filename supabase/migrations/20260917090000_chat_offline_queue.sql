-- Offline-kø til chatten (#219).
--
-- En besked skrevet i skoven uden dækning skal ikke fejle. Klienten lægger den
-- i en lokal kø (IndexedDB) og sender den, når der igen er forbindelse.
--
-- Idempotensen kommer fra primærnøglen: klienten giver den ventende besked et
-- id, og RPC'en nedenfor indsætter den med netop det id. En gentagelse -- fordi
-- svaret på et forsøg gik tabt, eller fordi appen blev lukket midt i
-- afsendelsen -- rammer derfor `on conflict (id) do nothing`, opretter ingen ny
-- række og svarer med den, der allerede ligger der. Klienten kan dermed fjerne
-- beskeden fra køen uden risiko for, at den dukker op to gange i chatten.
--
-- Afsendelse *med* forbindelse kører uændret gennem den direkte insert-policy;
-- den vej kender intet klient-id, og `written_at` står tom -- policyen
-- håndhæver det nu selv, så en direkte insert ikke kan sætte et vilkårligt
-- skrivetidspunkt og dermed give en online besked et forfalsket tidsstempel.
--
-- `created_at` er fortsat serverens modtagelsestidspunkt og dermed det,
-- rækkefølgen bygges på. `written_at` er det tidspunkt, brugeren skrev
-- beskeden, og er kun det, klienten viser som boblens tid -- så en besked fra
-- en dag uden dækning ikke ser ud til at være skrevet på det tidspunkt, den
-- nåede frem.
alter table public.messages
  add column written_at timestamptz;

-- Kun `send_chat_message` må sætte `written_at`: den er security definer og
-- omgår policyen. Den direkte insert-vej (med forbindelse) må aldrig sætte
-- den selv, ellers kan et medlem forfalske det viste skrivetidspunkt.
drop policy "Authenticated can send messages" on public.messages;
create policy "Authenticated can send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (room = 'general' or public.is_admin())
    and written_at is null
  );

create function public.send_chat_message(
  p_client_id uuid,
  p_content text,
  p_room text,
  p_reply_to_message_id uuid default null,
  p_message_type text default 'text',
  p_mentions uuid[] default '{}',
  p_written_at timestamptz default null
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  room text,
  message_type text,
  mentions uuid[],
  created_at timestamptz,
  written_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  reply_to_message_id uuid,
  inserted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  inserted_id uuid;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'message_send_not_authorized';
  end if;

  -- Uden et klient-id findes der ingen gentagelse at genkende, og beskeden
  -- ville blive lagt i køen hos klienten uden mulighed for at fjerne den igen.
  if p_client_id is null then
    raise exception using
      errcode = '22023',
      message = 'message_send_missing_client_id';
  end if;

  -- RPC'en er security definer og omgår dermed både insert-policyen og dens
  -- rumregel, så begge skal håndhæves her.
  if p_room is null or p_room not in ('general', 'admin') then
    raise exception using
      errcode = '22023',
      message = 'message_send_unknown_room';
  end if;

  if p_room = 'admin' and not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'message_send_not_authorized';
  end if;

  insert into public.messages (
    id,
    user_id,
    content,
    room,
    reply_to_message_id,
    message_type,
    mentions,
    written_at
  )
  values (
    p_client_id,
    actor_id,
    p_content,
    p_room,
    p_reply_to_message_id,
    coalesce(p_message_type, 'text'),
    coalesce(p_mentions, '{}'),
    -- Et ur, der står forkert, må ikke kunne skrive beskeden ind i fremtiden.
    least(coalesce(p_written_at, now()), now())
  )
  -- `on conflict (id)` kan ikke bruges her: funktionens uddataparameter hedder
  -- `id`, og målet for konflikten læses som et udtryk, så postgres ville se to
  -- kandidater. Primærnøglens constraint-navn er entydigt.
  on conflict on constraint messages_pkey do nothing
  returning messages.id into inserted_id;

  -- Der blev intet indsat, så id'et er optaget. Er det afsenderens egen
  -- besked, er det en gentagelse, og den returneres uændret. Er det en andens,
  -- må den hverken overskrives eller læses -- klient-id'er er tilfældige UUID'er
  -- og kan ikke gættes, men et svar ville alligevel lække indholdet.
  if inserted_id is null and not exists (
    select 1
    from public.messages as existing
    where existing.id = p_client_id
      and existing.user_id = actor_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'message_send_client_id_conflict';
  end if;

  return query
  select
    message.id,
    message.user_id,
    message.content,
    message.room,
    message.message_type,
    message.mentions,
    message.created_at,
    message.written_at,
    message.deleted_at,
    message.deleted_by,
    message.reply_to_message_id,
    -- `inserted_id` står tom, når konflikten ramte primærnøglen, altså når
    -- rækken allerede fandtes. Sammenlignet med NULL ville give NULL frem for
    -- false.
    inserted_id is not null as inserted
  from public.messages as message
  where message.id = p_client_id
    and message.user_id = actor_id;
end;
$$;

-- Samme mønster som soft_delete_message: funktionen er den eneste vej ind, og
-- kun et medlem må gå den. Uden revoke ville PostgreSQL's egen
-- execute-til-public gælde i produktion, og anon kunne sende i kø (#209).
revoke all on function public.send_chat_message(
  uuid, text, text, uuid, text, uuid[], timestamptz
) from public, anon, authenticated;
grant execute on function public.send_chat_message(
  uuid, text, text, uuid, text, uuid[], timestamptz
) to authenticated;

insert into public.feature_announcements (slug, title, body, path)
values (
  'beskeder-uden-daekning',
  'Beskeder skrevet uden dækning sendes nu af sig selv',
  'Er du i skoven uden net, kan du skrive alligevel. Beskeden står med "Sendes, når du er online" og bliver sendt, så snart telefonen har forbindelse igen. Den viser det tidspunkt, du skrev den -- og de andre ser den kun én gang.',
  'chat'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
