-- Menuen er gjort kortere (#285): Naturlog og Spil ligger nu som kort under
-- Aktiviteter, og "Log ud" står på profilsiden. Ingen skemaændring -- kun
-- nyheden, så medlemmerne ved, hvor tingene er flyttet hen.

insert into public.feature_announcements (slug, title, body, path)
values (
  'menu-naturlog-spil-log-ud',
  'Naturlog og Spil ligger nu under Aktiviteter',
  'Menuen er blevet kortere, så den kan ses på en telefon. Naturlog og Spil finder du nu under Aktiviteter, og "Log ud" ligger nederst på din profil.',
  'aktiviteter'
)
on conflict (slug) do nothing;
