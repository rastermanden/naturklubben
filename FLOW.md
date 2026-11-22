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

Skriv ned, hvad ændringen rører: filer, tabeller, autorisationsregler, Convex-funktioner,
workflows og medlemmernes data — og hvad der skal forblive urørt. `/blast-radius` i
skills-mappen går listen igennem.

## 3. Byg

- Egen branch, aldrig direkte på `main`.
- Ny adfærd får en test ved den kode, den dækker. Rører ændringen autorisationsmodellen,
  får den en `convex-test`, der kalder ind som den rigtige rolle og måler, hvad der faktisk
  sker (`V2/convex/authz.ts`, se `V2/README.md`).
- Produktionen på `https://naturklubben.dk` kører **V2** i `V2/` mod Convex
  (`quaint-parakeet-652`). V1-byggepipelinen (#378) samt V1-koden (`src/`, `supabase/`),
  `migrate-v1.yml`, `V2/scripts/migrateFromSupabase.mjs` og V1-rodconfig (#379) er
  fjernet, så repoet er rent V2/Convex. Bemærk at de 14 aktive Edge Functions i Supabase
  stadig bliver ved med at køre, indtil Martin pauser eller sletter Supabase-projektet, og
  at ingen GitHub-secrets (heller ikke `VAPID_*` eller `SUPABASE_*`) er slettet.
- Nye funktioner, medlemmerne kan mærke, tager deres nyhed med i samme ændring.
- Brugertekst læses som medlem, ikke som udvikler. Kør `/unslop` på ny tekst.
- Ændres frontend, så se den i et preview, ikke kun i test. Ændres design, så kom med et
  rigtigt skærmbillede.

## 4. Verificér lokalt, før PR'en åbnes

```bash
cd V2 && npm test && npm run lint && npx tsc -b && npx prettier --check .
```

Er branch'en bagud for `main`, merges `main` ind først — en forældet branch giver
misvisende resultater. CI (`.github/workflows/ci.yml`) kører de samme V2-tjek på PR'en.

## 5. Pull request

Beskriv hvad der er ændret, hvilke issues der lukkes (`Fixes #N`), hvad der er kørt af
tjek, og hvad et menneske stadig skal se efter. Vent på preview-linket fra
`pr-preview-v2.yml` og brug det: `naturklubben.dk/pr-preview/pr-<nr>/`, som kører mod sit
eget Convex preview-deployment.

## 6. Uafhængigt review

En anden model eller en anden agent læser den præcise diff — gerne med et andet fokus end
byggeren (sikkerhed, data, brugertekst, CI). Hvert bekræftet fund bliver et issue, også når
det ligger uden for ændringen. Retter man det med det samme, sker det med `Fixes #N` i
samme PR. Fund, der ikke kan genskabes i koden, noteres og lukkes med grunden.

## 7. Merge og udgivelse

Mennesket merger. Ved merge til `main` deployer `.github/workflows/deploy.yml` automatisk
Convex-funktionerne til produktion (`quaint-parakeet-652`) og udgiver `V2/dist` til
`https://naturklubben.dk`. Ingen kører en deploy-kommando i hånden. Grøn CI er ikke det
samme som live: kig på det udgivne site, og luk issueet først derefter.

## 8. Aflevering

Slut en byggerunde med en kort aflevering, der kan læses uden at grave i loggen: hvad blev
lavet, hvilke Done-tjek er opfyldt og med hvilken kommando, hvad blev besluttet, hvad er
usikkert, og hvad må den næste ikke antage.
