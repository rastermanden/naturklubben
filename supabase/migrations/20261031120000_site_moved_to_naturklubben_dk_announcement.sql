-- Appen er flyttet til naturklubben.dk. Ingen skemaændring: CORS for Edge
-- Functions og Supabase-auth'ens Site URL/redirect-URL'er følger med i
-- samme PR (cors.ts og sync-auth-config.yml) -- kun nyheden til medlemmerne.
--
-- Nyheden vises på den nye adresse, hvor man alligevel skal logge ind igen,
-- og fortæller, hvad der ikke flytter med af sig selv.

insert into public.feature_announcements (slug, title, body)
values (
  'flyttet-til-naturklubben-dk',
  'Naturklubben har fået sin egen adresse: naturklubben.dk',
  'Appen ligger nu på naturklubben.dk. Har du appen på din hjemmeskærm, så slet den gamle og tilføj den igen herfra. Og bruger du notifikationer, så slå dem til igen under din profil -- de flytter ikke med af sig selv.'
)
on conflict (slug) do nothing;
