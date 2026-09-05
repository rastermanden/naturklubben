-- Kompakte beskedbobler i chatten.
--
-- Ændringen er ren frontend: navn, tidspunkt og de tre handlinger deler nu én
-- linje i boblen i stedet for tre, tidspunktet skrives kort ("6 d" frem for
-- "for 6 dage siden", med det præcise tidspunkt som tooltip), og Svar/Reagér/
-- Slet er blevet til tegnene ↩︎, ☺︎ og ×. Der er intet skema at ændre.
--
-- Migrationen findes alligevel, fordi knapperne skifter udseende, og et
-- medlem, der leder efter ordet "Svar", skal kunne læse hvorfor det er væk
-- (se CLAUDE.md, "Nye funktioner meldes til medlemmerne").
insert into public.feature_announcements (slug, title, body, path)
values (
  'kompakte-beskeder',
  'Der er plads til flere beskeder på skærmen',
  'Hver besked fylder nu det halve: afsender, tidspunkt og knapper står på én linje øverst i boblen. Svar er blevet til ↩︎, Reagér til ☺︎ og Slet til ×. Tryk og hold på tidspunktet for at se det præcise klokkeslæt.',
  'chat'
)
on conflict (slug) do nothing;
