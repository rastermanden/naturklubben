-- Billed-bucketsene `photos-original` og `photos-optimized` blev oprettet
-- manuelt i dashboardet i #2 -- og findes derfor kun i produktion. En Preview
-- Branch starter fra migrationerne alene og har dem ikke, så hvert billedupload
-- på et PR-preview (galleri såvel som naturlog) fejlede med "Bucket not found".
--
-- Her oprettes de i SQL som `avatars` og `badge-images`, så de følger med
-- automatisk. Bevidst `do nothing` frem for `do update`: produktionens buckets
-- er sat op i hånden med indstillinger, der ikke står i koden, og dem skal en
-- migration ikke skrive over i blinde. Værdierne nedenfor gælder derfor kun,
-- hvor bucketten mangler.
--
-- Grænsen på 15 MB matcher MAX_FILE_SIZE i useUploadPhotos.ts. `image/*` fordi
-- klienten netop tillader alle billedtyper (også HEIC fra iPhones), og
-- optimize-image afgør selv, hvad den kan lave om.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos-original', 'photos-original', false, 15 * 1024 * 1024, array['image/*']),
  ('photos-optimized', 'photos-optimized', true, null, array['image/*'])
on conflict (id) do nothing;
