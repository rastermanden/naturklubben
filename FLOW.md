# Arbejdsgang

Løkken for hver ændring i Naturklubben. Den er den samme, hvad enten det er et menneske
eller en agent, der bygger, og den findes i sin fulde form som
`.agents/skills/projekt-workflow/SKILL.md`. `AGENTS.md` har de regler, der gælder for dette
projekt; denne fil er rækkefølgen.

Rollerne: **mennesket** bestemmer retningen, er publish gate og merger. **Byggeren** (ofte
en agent) skriver koden, tester den og åbner pull requestet. **Revieweren** er en anden end
byggeren — byggeren anmelder ikke sit eget arbejde som om det var en andens.

## 1. Observation bliver et issue

Løse ord fra ejeren bliver et issue med **Problem**, **Forventet** og **Done-tjek** (se
`.agents/skills/issue-fra-observation/SKILL.md`), plus et ord om hvordan det passer med
`VISION.md`. Done defineres, før der bygges — ellers kan ingen afgøre, om ændringen er
færdig.

## 2. Blast radius, før der bygges

Skriv ned, hvad ændringen rører: filer, tabeller, politikker, Edge Functions, workflows og
medlemmernes data — og hvad der skal forblive urørt. En ændring i en RLS-politik rammer
mere end den skærm, man kigger på. `/blast-radius` i skills-mappen går listen igennem.

## 3. Byg

- Egen branch, aldrig direkte på `main`.
- Ny adfærd får en test ved den kode, den dækker. Rører ændringen autorisationsmodellen,
  får den en test, der kalder ind som den rigtige rolle og måler, hvad der faktisk sker. I
  V2 er det en `convex-test` ved siden af funktionen, ikke en pgTAP-test: `convex-test`
  erstatter `supabase/tests/rls/`, se `V2/README.md`.
- Ændres V1's database, er det stadig migrationer: nye filer i `supabase/migrations/`. Ret
  aldrig i en fil, der er kørt i produktion, og skriv selv grants med (se `AGENTS.md`). En
  migration, der fejler, rettes med en ny migration. V1 er den app, der ligger i roden og
  stadig deployes fra `main`; V2 ligger i `V2/` og har sin egen kæde.
- Nye funktioner, medlemmerne kan mærke, tager deres nyhed med i samme ændring.
- Brugertekst læses som medlem, ikke som udvikler. Kør `/unslop` på ny tekst.
- Ændres frontend, så se den i et preview, ikke kun i test. Ændres design, så kom med et
  rigtigt skærmbillede.

## 4. Verificér lokalt, før PR'en åbnes

```bash
npm test && npm run lint && npm run format:check && npx tsc -b   # V1, i roden
cd V2 && npm test && npm run lint && npx tsc -b                   # V2
```

Er branch'en bagud for `main`, merges `main` ind først — en forældet branch giver
misvisende resultater. CI kører det samme på PR'en. Rører PR'en `supabase/`, afspiller
`database`-jobbet desuden hele migrationskæden på en tom Postgres sammen med V1's pgTAP-suite
— den del holder op med at være relevant i samme takt som V1 udfases.

## 5. Pull request

Beskriv hvad der er ændret, hvilke issues der lukkes (`Fixes #N`), hvad der er kørt af
tjek, og hvad et menneske stadig skal se efter. Vent på preview-linket og brug det:
`naturklubben.dk/pr-preview/pr-<nr>/`. Rører PR'en `supabase/`, bygges previewet mod PR'ens
egen Preview Branch, så data og skema passer sammen.

## 6. Uafhængigt review

En anden model eller en anden agent læser den præcise diff — gerne med et andet fokus end
byggeren (sikkerhed, data, brugertekst, CI). Hvert bekræftet fund bliver et issue, også når
det ligger uden for ændringen. Retter man det med det samme, sker det med `Fixes #N` i
samme PR. Fund, der ikke kan genskabes i koden, noteres og lukkes med grunden.

## 7. Merge og udgivelse

Mennesket merger. Ved merge til `main` deployer `deploy.yml` automatisk til
`https://naturklubben.dk`, og Supabase deployer migrationerne og Edge Functions. Ingen
kører en deploy-kommando i hånden. Grøn CI er ikke det samme som live: kig på det
udgivne site, og luk issueet først derefter.

## 8. Aflevering

Slut en byggerunde med en kort aflevering, der kan læses uden at grave i loggen: hvad blev
lavet, hvilke Done-tjek er opfyldt og med hvilken kommando, hvad blev besluttet, hvad er
usikkert, og hvad må den næste ikke antage.
