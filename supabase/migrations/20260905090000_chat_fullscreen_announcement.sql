-- Mere plads til chatten på en telefon.
--
-- Ændringen er ren frontend: footeren udelades på chatsiden, søgefelt og
-- notifikationsvalg foldes sammen bag en knap under sm-breakpointet, og
-- chatten kan lægges i fuldskærm (browserens egen, hvor den findes, ellers
-- appens eget lag over app-shellen). Der er intet skema at ændre.
--
-- Migrationen findes alligevel, fordi medlemmerne kan mærke forskellen, og
-- nyheder om nye funktioner er kode (se CLAUDE.md, "Nye funktioner meldes til
-- medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'chat-fuldskaerm',
  'Chatten fylder nu skærmen på telefonen',
  'Beskederne har fået den plads, der før gik til søgefelt og knapper -- de ligger nu bag tandhjulet øverst i chatten. Vil du have det hele, så tryk på ⤢ og læs chatten i fuldskærm; tryk på ⤡ for at komme ud igen.',
  'chat'
)
on conflict (slug) do nothing;
