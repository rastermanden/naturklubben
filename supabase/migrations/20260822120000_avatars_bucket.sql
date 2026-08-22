-- Profilbilleder (#7/#14): ProfilePage uploadede til en bucket ved navn `photos`,
-- som aldrig har eksisteret -- de eneste buckets er `photos-original` (privat) og
-- `photos-optimized` (kun skrivbar for Edge Functions). Hvert upload fejlede
-- derfor med "Bucket not found".
--
-- Avatarer har brug for en *permanent* offentlig URL, fordi den gemmes i
-- profiles.avatar_url og læses af alle medlemmer i chatten. En signeret URL fra
-- den private bucket ville udløbe, så vi opretter en dedikeret offentlig
-- `avatars`-bucket i stedet.
--
-- Bucketten oprettes her i SQL (ikke manuelt i dashboardet), så den kommer med
-- automatisk via Supabase's GitHub-integration -- både på PR-preview-branches og
-- i produktion ved merge. Se kerneprincippet i CLAUDE.md.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Alle (også udloggede) kan læse avatarer -- bucketten er offentlig, og URL'en
-- gemmes som klartekst i profiles.avatar_url.
create policy "Anyone can read avatars"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

-- Skrivning er begrænset til brugerens egen mappe: avatars/<user-id>/<fil>.
-- Både insert og update er nødvendige -- Storage's upsert laver et update, når
-- filen findes i forvejen.
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Bruges til at rydde op i den forrige avatar, når en ny uploades.
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
