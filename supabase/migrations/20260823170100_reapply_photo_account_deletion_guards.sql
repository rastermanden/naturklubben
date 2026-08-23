-- #98 kan blive backfillet på en eksisterende Preview Branch, efter #86's
-- oprindelige migration allerede er kørt. Genskab derfor de endelige
-- Storage-policies efter begge migrations, så ejer-/præfiksafgrænsning og
-- kontoslettereservation gælder uanset branchens historik.

drop policy if exists "Authenticated can upload original photos"
  on storage.objects;
create policy "Authenticated can upload original photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  );

drop policy if exists "Owners can update own original photos"
  on storage.objects;
create policy "Owners can update own original photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  )
  with check (
    bucket_id = 'photos-original'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.account_accepts_writes()
  );
