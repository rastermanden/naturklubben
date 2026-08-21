-- Storage-policies for de to buckets oprettet manuelt i #2:
--   photos-original  (privat) — kun autentificerede medlemmer
--   photos-optimized (public) — alle kan læse, kun Edge Function (Secret key,
--                                 omgår RLS) skriver

create policy "Authenticated can read original photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photos-original');

create policy "Authenticated can upload original photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos-original' and owner = auth.uid());

create policy "Owners can delete own original photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos-original' and owner = auth.uid());

create policy "Anyone can read optimized photos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'photos-optimized');

-- Bevidst ingen insert/update/delete-policy for photos-optimized: uden en
-- matchende policy kan kun service_role/Secret key skrive dertil (RLS
-- blokerer alle andre), hvilket er meningen -- kun optimize-image-functionen (#13)
-- må skrive de optimerede filer.
