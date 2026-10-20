# Naturklubben V2 — Convex-native omskrivning

V2 er den samme medlemsapp bygget om på Convex i stedet for Supabase. Den ligger
i sin egen mappe med sit eget `package.json` og sit eget build, så den kan
deployes uden at røre den nuværende app. **Den nuværende app i roden er
uændret, og `main`-deployet peger stadig på den.**

## Status

Fundamentet er lagt. Intet domæne er færdigportet endnu, og **der er ikke kørt
et build eller en test mod et rigtigt Convex-deployment** — se "Verifikation".

| Del | Status |
| --- | --- |
| Værktøjskæde (Vite, React, TypeScript, Tailwind, Vitest) | på plads |
| `convex/schema.ts` + domænefiler i `convex/tables/` | ramme på plads |
| Autorisationslag (`convex/authz.ts`) | på plads |
| Convex Auth (adgangskode) | konfigureret, ikke afprøvet |
| Skema for medlemmer, allowlist, admin-roller | skrevet |
| Kalender, chat, galleri, fællesskab (skema + funktioner + sider) | ikke portet |
| Push, cron, offentlig iCal-feed | ikke portet |
| CI/deploy for V2 | workflow tilføjet, kræver secrets |

## Kom i gang

V2 kan ikke bygges eller testes, før der findes et Convex-deployment. Det er et
**engangs manuelt trin**, på samme måde som Supabase-projektet var det (issue
#2): nogen med adgang til Convex skal oprette projektet og lægge nøglerne i
GitHub.

1. Opret et projekt på <https://dashboard.convex.dev> (eller kør
   `npx convex dev` lokalt første gang, som logger ind via browseren). **Vælg
   region `aws-eu-west-1` (Irland) med det samme** — regionen kan ikke ændres
   bagefter, og en flytning kræver eksport/import til et nyt projekt. EU koster
   30 % tillæg på forbruget; for en klub af denne størrelse er det småpenge mod
   at have medlemmernes billeder og chat liggende uden for EU.
2. `cd V2 && npm install`
3. `npx convex dev` — opretter udviklings-deploymentet, skriver
   `VITE_CONVEX_URL` i `V2/.env.local` og genererer `convex/_generated/`.
   Sidstnævnte er forudsætningen for, at `tsc` og `convex-test` kan køre
   overhovedet; mappen committes.
4. `npm run dev` — appen kører på `http://localhost:5173/naturklubben/v2/`.

Til GitHub Actions skal der bruges to ting i repoets indstillinger:

- `CONVEX_DEPLOY_KEY` (secret) — til `npx convex deploy` fra CI.
- `VITE_CONVEX_URL` (variable eller secret) — til frontend-buildet.

## Skift mellem de to apps

De to apps har hvert sit build og deler ikke kode. Et skift er derfor et
deploy-valg, ikke en kodeændring:

- **Begge samtidigt.** `deploy-v2.yml` bygger V2 med standardstien
  `/naturklubben/v2/` og lægger den ved siden af den nuværende app på samme
  GitHub Pages-site. Intet af den gamle app røres.
- **V2 som den rigtige app.** Kør samme workflow med `base_path` sat til
  `/naturklubben/` og `publish_to_root` slået til. V2 overskriver da
  `index.html` på produktions-URL'en; den gamle app ligger stadig i git og kan
  deployes tilbage med `deploy.yml`.
- **Tilbage til den gamle app.** Kør `deploy.yml` igen. Der er intet at
  migrere tilbage, fordi V2 ikke skriver i den gamle apps database.

Begge apps kan køre mod hver sin backend samtidigt; de deler kun domænet.

## Hvad der er anderledes end den gamle app

Convex er ikke Postgres med et andet API. Forskellene herunder er valg, ikke
mangler — men de skal kendes, fordi nogle af dem er sikkerhedsmæssige.

### Autorisation

Den gamle app havde 115 RLS-politikker, som databasen håndhævede for enhver
kode, der spurgte. Convex har ingen RLS. Enhver `query` og `mutation` ser de
data, den selv læser, og kan kaldes af enhver, der kender dens navn.

Reglen i V2 er derfor: **hver eksporteret funktion kalder `requireProfile`,
`requireWritableProfile` eller `requireAdmin` fra `convex/authz.ts`, før den
rører data.** En funktion uden et sådant kald er offentlig. Det erstatter 115
politikker med et krav om, at hver funktion gør det rigtige — og det er præcis
den slags, der skal have en test.

`convex-test`-tests erstatter pgTAP-testene i `supabase/tests/rls/`. Kravet fra
`AGENTS.md` gælder uændret: rører en ændring autorisationsmodellen, skal den
have en test, der kalder funktionen som den rigtige rolle og måler, hvad der
faktisk sker.

### Adgangskoder

Supabase gemte bcrypt-hashes i `auth.users`, som ikke kan læses gennem API'et.
Convex Auth gemmer sin egen hash. Der er derfor **ingen måde at flytte
adgangskoder med over**. To muligheder, og valget er ikke taget endnu:

1. Alle medlemmer sætter en ny adgangskode via nulstillingsflowet (enkelt, og
   for en klub af denne størrelse sandsynligvis fint).
2. En engangs-import: eksportér hashes med SQL-adgang til den gamle database,
   og verificér dem i en tilpasset provider ved første login. Kræver, at Convex
   Auth kan udvides med en egen hash-verifikation — **ikke undersøgt**.

Indtil det er afgjort, kan kun nye konti oprettes i V2.

### Data

Der er ingen automatisk overførsel. En flytning kræver eksport fra Postgres,
transform til Convex-dokumenter og indlæsning i batches. Rækkefølgen er styret
af referencer, og filer (billeder, avatarer) skal uploades igen til Convex
filstorage.

### Søgning

Den gamle app søger i chatten med `ilike` og trigram-indeks, altså vilkårlige
dele af ord. Convex' søgeindeks matcher tokens og præfikser. Midt-i-ord-søgning
skal derfor genopbygges (fx med et token-tabel eller n-grammer) — det er ikke
en indstilling.

### Aggregeringer

Convex har ingen `count(*)`, `group by` eller joins i queries. Optællinger som
`gallery_event_photo_counts` og turneringsstillinger skal vedligeholdes som
tal i dokumenter, opdateret i samme mutation som ændringen.

### CI og previews

Supabase gav hver PR en Preview Branch med PR'ens egne migrationer, og
`pr-preview.yml` byggede frontend mod netop den database.

Convex har noget tilsvarende, men det er en **beta-funktion** og virker
anderledes: `npx convex deploy` med en *preview deploy key* opretter et
midlertidigt deployment pr. git-branch — navnet tages automatisk fra branchen i
GitHub Actions — og genbruger det, hvis det findes. Deploymentet ryddes
automatisk efter 5 dage (14 på de betalte planer). `--preview-run <funktion>`
kan seede data ved oprettelsen, hvilket er den nærmeste pendant til at køre
migrationer på en frisk preview-database.

Det betyder, at V2 **kan** få et per-PR-backend som den gamle app, men det skal
skrives: en workflow, der (1) deployer backend med en preview deploy key, (2)
læser det preview-deployments URL ud og (3) bygger frontend med den URL. Indtil
den workflow findes, er et V2-preview et frontend-preview mod ét delt
deployment. Forskellen fra Supabase er, at branchen ikke får en *kopi af
data* — et preview-deployment starter tomt (eller med det, `--preview-run`
lægger ind).

## Verifikation

Vigtigt: **intet i V2 er kompileret, lintet eller formateret endnu.**
Arbejdsmiljøet, V2 er skrevet i, har hverken Node eller `node_modules`, så
følgende er *ikke* kørt og skal køres som det første, når V2 åbnes i CI eller
på en maskine med Node:

1. `cd V2 && npm install` — versionsnumrene i `package.json` er ikke afstemt
   mod registry'et, så en afhængighed kan skulle rettes her.
2. `npx convex dev` — genererer `convex/_generated/`, som `tsc` og
   `convex-test` forudsætter.
3. `npm run build` og `npm test` i `V2`.
4. `npx prettier --write V2` fra roden, så `format:check` i `ci.yml` ikke
   fejler på de nye filer.
5. `npm run lint` og `npx tsc -b` fra roden — `ci.yml` dækker begge og ser også
   V2's filer.

Først derefter kan nogen sige, at fundamentet holder. Indtil da er status
"skrevet, ikke afprøvet".

Mappestrukturen er den samme som i den gamle app, så en fil kan findes på det
samme sted i begge:
```
V2/
  convex/
    schema.ts        # samler tabel-filerne
    tables/          # ét domæne pr. fil
    authz.ts         # al autorisation
    auth.ts          # Convex Auth
    http.ts          # offentlige HTTP-ruter (iCal, gæsteformular)
  src/
    pages/           # sidekomponenter
    features/        # feature-logik, en mappe pr. domæne
    components/      # delt UI
    lib/             # convexClient, versionsvisning, SPA-fallback
```

## Kilder

Docs-indekset er <https://docs.convex.dev/llms.txt> (enhver side findes også som
`.md`). Følgende sider blev læst, før V2 blev skrevet, fordi de afgør valg, som
ellers ville være gætteri:

| Side | Hvad den afgjorde |
| --- | --- |
| `production/regions.md` | Der findes en EU-region (`aws-eu-west-1`, +30 %). Den kan ikke ændres bagefter. |
| `production/multiple-deployments.md`, `cli/reference/deploy.md` | Preview-deployments findes (beta): ét pr. branch, automatisk navn i GitHub Actions, ryddes efter 5 dage, `--preview-run` kan seede. |
| `database/advanced/occ.md` | Mutationer er serialiserbare, så "der er stadig en anden admin" kan ikke blive falsk mellem læsning og skrivning. Advisory locks behøves ikke. |
| `functions/error-handling/application-errors.md` | `ConvexError` er den eneste vej til at få en fejlkode frem til klienten; en almindelig `Error` sløres i produktion. |
| `search/text-search.md` | Søgning er term- og præfiksbaseret på Tantivy. Midt-i-ord-søgning findes ikke — derfor skal chat-søgningen bygges om. |
| `functions/runtimes.md` | `"use node"` giver Node-pakker i actions, men filen må ikke indeholde queries/mutations. Billedbehandling og Web Push kræver hver sin Node-action-fil. |
| `file-storage/overview.md` | En `getUrl`-adresse er en bearer-URL: enhver, der kender den, kan hente filen, og den kan kun trækkes tilbage ved at slette filen. HTTP-action er den dokumenterede vej til adgangskontrol. |

Det, der stadig er **uverificeret** og skal afgøres mod et rigtigt deployment:

- Convex Auth: om `signUp` gemmer navnet på `users`, om sessionen er sat før et
efterfølgende `claimProfile`, og hvordan nulstillingsmails sendes (der kræves
en mailudbyder og en hemmelighed på deploymentet — se `convex/auth.ts`).
- Om `authAccounts` har et stabilt indeks til e-mailopslag; `members.ts` bruger
  `filter` for ikke at binde sig til et biblioteksinternt indeksnavn.
- `ctx.db.system.get` og `v.id('_storage')` i praksis, samt indeks over
  valgfrie felter (`by_client_upload`).

