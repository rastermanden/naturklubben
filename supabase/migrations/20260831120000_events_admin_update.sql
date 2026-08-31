-- #196: administratorer kan redigere klubbens begivenheder, ikke kun sine
-- egne. Sletning er stadig forbeholdt den, der oprettede begivenheden --
-- issuet beder kun om redigering.
drop policy if exists "Owners can update own events" on public.events;
create policy "Owners and admins can update events"
  on public.events for update
  to authenticated
  using (auth.uid() = created_by or public.is_admin())
  with check (auth.uid() = created_by or public.is_admin());
