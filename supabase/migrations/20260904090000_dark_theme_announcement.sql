-- Mørk tilstand til aftenbrug.
--
-- Ændringen er ren frontend: temaet er semantiske CSS-variabler i
-- src/index.css og et valg, der gemmes på selve enheden (localStorage), ikke i
-- profiles. Et tema hører til skærmen, ikke til medlemmet -- den samme person
-- vil gerne have mørkt på telefonen om aftenen og lyst på computeren om
-- formiddagen. Derfor er der intet skema at ændre her.
--
-- Migrationen findes alligevel, fordi medlemmerne kan mærke forskellen, og
-- nyheder om nye funktioner er kode (se CLAUDE.md, "Nye funktioner meldes til
-- medlemmerne"). Uden path: vælgeren står i bunden af hver side og i menuen,
-- så der er ikke ét sted at sende folk hen.
insert into public.feature_announcements (slug, title, body)
values (
  'moerkt-tema',
  'Appen kan nu blive mørk om aftenen',
  'Nederst på siden -- og i menuen på telefonen -- kan du nu vælge mellem Lys, Mørk og Auto. Auto følger telefonens egen indstilling, så appen selv bliver mørk, når din telefon gør det om aftenen. Valget gælder den enhed, du sidder med.'
)
on conflict (slug) do nothing;
