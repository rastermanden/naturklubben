-- Fortæl medlemmerne, at links i chatten nu er klikbare (se CLAUDE.md, "Nye
-- funktioner meldes til medlemmerne"). Selve ændringen er ren frontend-visning
-- uden skemaændringer, men får stadig sin egen nyhed.
insert into public.feature_announcements (slug, title, body, path)
values (
  'chat-klikbare-links',
  'Links i chatten er nu klikbare',
  'Sæt en tur- eller artikellink ind i en besked, og det bliver automatisk til et link, man kan trykke på.',
  'chat'
)
on conflict (slug) do nothing;
