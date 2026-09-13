-- Album og kommentarer i galleriet (#218).
--
-- Galleriet grupperes nu i album pr. begivenhed ("Uden begivenhed" som sit
-- eget album), og medlemmer kan kommentere de enkelte billeder.

-- ---------------------------------------------------------------------------
-- gallery_albums: album-forsiden (#218)
-- ---------------------------------------------------------------------------
-- Ét album pr. distinkt event_id -- inklusive NULL, som Postgres' GROUP BY
-- allerede behandler som sin egen gruppe, så "Uden begivenhed" kommer gratis
-- med, uden en UNION. security_invoker betyder, at RLS på photos/events
-- stadig afgør, hvad den kaldende bruger ser (samme mønster som
-- gallery_event_photo_counts, #149) -- viewet selv giver ingen ekstra adgang.
--
-- Coveret er den nyeste *optimerede* (`optimization_status = 'ready'`) foto i
-- albummet, jf. #218: et billede, der stadig optimerer, er ikke et stabilt
-- cover. `latest_photo_at` er med, så en klient kan sortere album efter
-- seneste aktivitet uden selv at hente hvert billede -- og så albumforespørgs-
-- ler forbliver nøglet på event_id, hvis en senere keyset-side (#124) skal
-- hente ét albums billeder ad gangen.
create view public.gallery_albums
with (security_barrier = true, security_invoker = true)
as
with albums as (
  select
    p.event_id,
    count(*) as photo_count,
    max(p.created_at) as latest_photo_at
  from public.photos p
  group by p.event_id
),
covers as (
  select distinct on (p.event_id)
    p.event_id,
    p.id as cover_photo_id,
    p.thumbnail_path as cover_thumbnail_path,
    p.optimized_path as cover_optimized_path,
    p.storage_path as cover_storage_path
  from public.photos p
  where p.optimization_status = 'ready'
  order by p.event_id, p.created_at desc, p.id desc
)
select
  albums.event_id,
  e.title,
  e.start_at,
  albums.photo_count,
  albums.latest_photo_at,
  covers.cover_photo_id,
  covers.cover_thumbnail_path,
  covers.cover_optimized_path,
  covers.cover_storage_path
from albums
left join public.events e on e.id = albums.event_id
left join covers on covers.event_id is not distinct from albums.event_id;

revoke all on public.gallery_albums from public, anon, authenticated;
grant select on public.gallery_albums to authenticated;

comment on view public.gallery_albums is
  'One row per photo album (grouped by event_id, NULL = "Uden begivenhed") with its cover, count and event date -- powers the gallery album grid (#218).';

-- ---------------------------------------------------------------------------
-- photo_comments (#218)
-- ---------------------------------------------------------------------------
create table public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- Kommentarlisten hentes altid "alle kommentarer til dette billede, i
-- skrivetidsrækkefølge" -- samme opslagsform som chattens
-- (created_at, id)-indeks.
create index photo_comments_photo_id_created_at_idx
  on public.photo_comments (photo_id, created_at, id);

alter table public.photo_comments enable row level security;

-- Kun medlemmer kan læse -- samme kreds som billederne selv.
create policy "Authenticated can read photo comments"
  on public.photo_comments for select
  to authenticated
  using (true);

-- Alle skrivninger går gennem create_photo_comment/delete_photo_comment
-- nedenfor, så validering af indhold og "forfatter eller admin"-reglen for
-- sletning kun findes ét sted.
revoke insert, update, delete on table public.photo_comments
  from anon, authenticated;

-- anon får samme select-grant som authenticated (#209-konventionen, jf.
-- tournaments): uden den fejler et anonymt kald hårdt ("permission denied")
-- i stedet for at RLS'en stille filtrerer alt væk, som resten af appen
-- forventer. RLS-policyen ovenfor er stadig kun for authenticated, så en
-- anonym læser får 0 rækker, ikke andres kommentarer.
grant select on table public.photo_comments to anon, authenticated;
grant delete, insert, select, update on table public.photo_comments
  to service_role;

-- photo_comment_counts: ét lille, dedikeret view til galleriets
-- kommentarantal-badge (PhotoThumbnail), så klienten ikke behøver at hente
-- hver eneste kommentar for at vise et tal.
create view public.photo_comment_counts
with (security_barrier = true, security_invoker = true)
as
select photo_id, count(*) as comment_count
from public.photo_comments
group by photo_id;

revoke all on public.photo_comment_counts from public, anon, authenticated;
grant select on public.photo_comment_counts to authenticated;

comment on view public.photo_comment_counts is
  'Comment counts per photo, for the gallery thumbnail badge (#218).';

-- ---------------------------------------------------------------------------
-- create_photo_comment
-- ---------------------------------------------------------------------------
create or replace function public.create_photo_comment(
  p_photo_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  trimmed_body text := btrim(coalesce(p_body, ''));
  inserted public.photo_comments%rowtype;
begin
  if actor_id is null or not public.account_accepts_writes() then
    raise exception using
      errcode = '42501',
      message = 'photo_comment_not_authorized';
  end if;

  if trimmed_body = '' or char_length(trimmed_body) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'photo_comment_invalid_body';
  end if;

  if not exists (select 1 from public.photos where id = p_photo_id) then
    raise exception using
      errcode = 'P0002',
      message = 'photo_comment_photo_not_found';
  end if;

  insert into public.photo_comments (photo_id, user_id, body)
  values (p_photo_id, actor_id, trimmed_body)
  returning * into inserted;

  return jsonb_build_object(
    'id', inserted.id,
    'photo_id', inserted.photo_id,
    'user_id', inserted.user_id,
    'body', inserted.body,
    'created_at', inserted.created_at
  );
end;
$$;

revoke all on function public.create_photo_comment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_photo_comment(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- delete_photo_comment
-- ---------------------------------------------------------------------------
-- Forfatteren selv eller en admin kan slette -- samme regel som
-- soft_delete_message, men kommentaren fjernes helt: der er intet
-- moderationsbehov for at bevare en tømt kommentar, som der er for
-- fælleschatten.
create or replace function public.delete_photo_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.photo_comments%rowtype;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'photo_comment_delete_not_authorized';
  end if;

  select *
  into target
  from public.photo_comments
  where id = p_comment_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'photo_comment_delete_not_found';
  end if;

  if target.user_id is distinct from actor_id and not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'photo_comment_delete_not_authorized';
  end if;

  delete from public.photo_comments where id = p_comment_id;
end;
$$;

revoke all on function public.delete_photo_comment(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_photo_comment(uuid)
  to authenticated;

-- Kommentarer skal tikke ind live i lysbordet, ligesom chatbeskeder og
-- reaktioner.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photo_comments'
  ) then
    alter publication supabase_realtime add table public.photo_comments;
  end if;
end
$$;

insert into public.feature_announcements (slug, title, body, path)
values (
  'galleri-album-kommentarer',
  'Album og kommentarer i galleriet',
  'Billederne er nu samlet i album pr. tur -- med et eget album til billeder uden begivenhed. Åbn et billede og skriv en kommentar, så andre medlemmer kan se den med det samme.',
  'billeder'
)
on conflict (slug) do nothing;
