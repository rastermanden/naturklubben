-- Flerdagsbegivenheder i kalenderen (#259). Ren frontend-ændring (plus
-- filtret i calendar-feed): end_at findes allerede, og en tur, der er i gang,
-- læses med de samme politikker som før -- kun nyheden til medlemmerne.

insert into public.feature_announcements (slug, title, body, path)
values (
  'kalender-flerdagsbegivenheder',
  'Ture over flere dage står nu på alle dagene',
  'En weekendtur eller en lejr vises nu i kalenderen på hver dag, den varer, med slutdato og -tid. Og er turen i gang, står den stadig under de kommende, så du kan se, hvem der er med.',
  'kalender'
)
on conflict (slug) do nothing;
