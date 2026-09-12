-- Flere hjertesager at vælge imellem (#210 havde tre). Databasen kender kun
-- slugs; tegn og navne bor i src/features/profile/causes.ts, som skal udvides
-- i samme takt. Constrainten kan ikke ændres på stedet, så den lægges om.

alter table public.profiles
  drop constraint profiles_causes_known;

alter table public.profiles
  add constraint profiles_causes_known
    check (
      causes <@ array[
        'ukraine',
        'regnbue',
        'vaccine',
        'trans',
        'klima',
        'biodiversitet',
        'dyrevelfaerd',
        'plantebaseret',
        'fred',
        'bloddonor',
        'organdonor',
        'cykel'
      ]::text[]
      and cardinality(causes) = public.distinct_count(causes)
    );

insert into public.feature_announcements (slug, title, body, path)
values (
  'profil-flere-hjertesager',
  'Flere mærker at sætte ved dit navn',
  'Der er kommet flere hjertesager at vælge imellem på din profil: 🏳️‍⚧️ transflaget, 🌍 klimaet, 🐝 biodiversitet, 🐾 dyrevelfærd, 🌱 plantebaseret, 🕊️ fred, 🩸 bloddonor, 🫀 organdonor og 🚲 cyklist. Vælg dem, der passer på dig.',
  'profil'
)
on conflict (slug) do nothing;
