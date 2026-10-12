-- Tidligere begivenheder i kalenderen (#257). Ren frontend-ændring: members
-- kan allerede læse alle rækker i public.events ("Authenticated can read
-- events" er using (true)), så der er intet skema at ændre -- kun nyheden til
-- medlemmerne.

insert into public.feature_announcements (slug, title, body, path)
values (
  'kalender-tidligere-begivenheder',
  'Nu kan du se tidligere ture i kalenderen',
  'Bladr tilbage i kalenderen for at se, hvad klubben har lavet, og hvem der var med. På mobilen finder du dem under "Tidligere begivenheder" nederst på siden.',
  'kalender'
)
on conflict (slug) do nothing;
