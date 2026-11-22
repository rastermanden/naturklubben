# Naturklubben — projektinstruktioner

`CLAUDE.md` importerer denne fil med `@AGENTS.md`. Ret kun her. Claude Code læser
`CLAUDE.md`, og de andre coding agents læser `AGENTS.md`, så begge får samme tekst.

Medlemsapp for Naturklubben på `https://naturklubben.dk`. Produktiv app og backend er
**V2** i `V2/` på **Convex** (`quaint-parakeet-652`), med statisk frontend hostet på
GitHub Pages (`V2/dist` via `.github/workflows/deploy.yml` og eget domæne i
`V2/public/CNAME`).

V1-koden (`src/`, `supabase/`) samt `migrate-v1.yml` og
`V2/scripts/migrateFromSupabase.mjs` bliver liggende i repoet indtil et efterfølgende
issue (#379), mens V1-byggepipelinen (`pr-preview.yml`, `deploy-functions.yml`,
`sync-auth-config.yml` samt `database`- og V1/Deno-jobbene i `ci.yml`) er fjernet (#378).

## Før du gør noget

**Følg `.agents/skills/projekt-workflow/SKILL.md`.** Den beskriver løkken for hver ændring:
issue med Done-tjek, blast radius, byg, verificér, uafhængigt review, og mennesket som
publish gate. `FLOW.md` er samme løkke tilpasset dette projekt — læs den sammen med denne
fil. `VISION.md` siger, hvorfor appen findes, og hvert issue og hver ændring tjekkes op
imod den.

**Skills bor ét sted: `.agents/skills/`.** Både Antigravity og OpenCode læser den mappe.
Claude læser `.claude/skills`, som er et symlink til samme mappe, så alle modeller ser
præcis samme kopi. Ret en skill i `.agents/skills/` — aldrig gennem symlinket.

- `.agents/skills/projekt-workflow/` — løkken for hver ændring. Start her.
- `.agents/skills/issue-fra-observation/` — løse ord bliver et issue med Problem,
  Forventet og Done-tjek.
- `.agents/skills/typesafe-ai/` — valgfri, kun når ejeren beder om et judge-kald.
- `.agents/skills/VENDORED.md` — hvilke skills der er kopieret uændret fra hvor. De filer
  rettes ikke her; skal de ændres, gøres det på kilden og kopieres ind igen.
  `.agents/skills/LICENSE` dækker de kopierede skills, og hver enkelt har sin egen
  `LICENSE`, hvor kilden kræver det.
- Resten af mappen er pstack-skills (`architect`, `poteto-mode`, `tdd`, `unslop`,
  `interrogate`, `blast-radius`, `correct`, `show-me-your-work`, ...). Brug dem, når de
  passer — de er ikke projektspecifikke krav.

**Kontrakten for en byggerunde:**

- **JOB** — gør ændringen, så den stadig passer med `VISION.md`, og så hvert Done-tjek i
  issueet er opfyldt.
- **KILDER** — issueet, `VISION.md`, den kode og de tests ændringen rører, og den faktiske
  kontrakt i `V2/` og workflows — ikke en husket version af den.
- **FÆRDIG** — alle Done-tjek opfyldt eller markeret som ikke testbare her,
  `cd V2 && npm test && npm run lint && npx tsc -b && npx prettier --check .` grønne,
  CI grøn på PR'en, og previewet set med egne øjne når ændringen kan ses.
- **OUTPUT** — et pull request ejeren kan merge, med hvad der er ændret, hvilke issues der
  lukkes, hvad der er kørt, og hvad et menneske stadig skal se efter.
- **FORBUDT** — at merge, tagge eller udgive; at pushe til `main`; at køre manuelle
  prod-deploys (`npx convex deploy --prod` eller `supabase db push` fra en lokal terminal);
  at pause, slette eller ændre i det gamle Supabase-projekt; at slette en migrationsfil; at
  slette branches med `git push --delete`; at lægge hemmeligheder, personnavne,
  mailadresser eller hjemmestier i kode eller commits.

## Kerneprincip: alt udvikling skal kunne ske fra Claude-appen

Denne app udvikles primært af Claude (i Claude Code/Claude-appen), ikke fra en udviklers
lokale terminal. Derfor gælder:

- **Ingen trin i den løbende udvikling må kræve lokal Docker, lokal databasestak eller
  manuelle CLI-deploy-kommandoer kørt af et menneske.** Alt skal kunne udføres ved at
  skrive kode, committe og pushe/åbne PR.
- Engangs-opsætningsopgaver i et dashboard (fx oprettelse af Convex-projekt, GitHub Pages
  eller repo-secrets) udføres én gang af et menneske.
- Alt andet — Convex-skema og -funktioner, frontend, PWA, CI/CD-workflows — skrives og
  pushes som almindelig kode. Deploy sker automatisk via GitHub Actions (`deploy.yml` og
  `pr-preview-v2.yml`), aldrig ved at nogen manuelt kører en deploy-kommando.

## Overgangsstatus for Supabase (V1)

- **Produktionen på `naturklubben.dk` kører på V2/Convex (`quaint-parakeet-652`).**
  Supabase er ikke længere den kørende produktions-backend.
- `pr-preview.yml`, `deploy-functions.yml` og `sync-auth-config.yml` er fjernet (#378), og
  `ci.yml` kører ikke længere `database`-jobbet (pgTAP/`supabase/postgres`),
  Deno-tjek af Edge Functions eller root V1-test/lint/typecheck.
- **Vigtigt om Edge Functions:** Fjernelsen af `deploy-functions.yml` stopper kun _nye_
  deploys. De 14 aktive Edge Functions i Supabase-projektet bliver ved med at køre, indtil
  Martin selv pauser eller sletter Supabase-projektet.
- **Slet ikke hemmeligheder i denne overgang:** GitHub-secrets (`SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_REF`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` osv.)
  samt `migrate-v1.yml`, `V2/scripts/migrateFromSupabase.mjs`, `src/` og `supabase/`
  bliver stående indtil #379.

## Client (frontend) & PR-previews

- Al produktiv frontend- og backend-udvikling sker i `V2/` (Vite/React/TypeScript +
  Convex), committes og pushes/åbnes som PR.
- Hver PR får automatisk et preview-link på `naturklubben.dk/pr-preview/pr-<nr>/` via
  `.github/workflows/pr-preview-v2.yml`. Intet manuelt deploy-trin.
- Ved merge til `main` deployer `.github/workflows/deploy.yml` automatisk Convex-backend
  og bygger `V2/dist` til `https://naturklubben.dk`.
- **PR'er fra Copilot coding agent får ikke automatisk et preview-link — deres workflows
  skal godkendes manuelt.** Copilot åbner PR'en som sin egen GitHub App
  (`copilot-swe-agent`), ikke som en bruger med write-adgang, og GitHub behandler den
  derfor som en ekstern bidragyder: `ci.yml` og `pr-preview-v2.yml` bliver oprettet, men
  starter aldrig — de står med status `action_required`, indtil et menneske trykker
  **"Approve and run workflows"** i PR'ens merge-boks. Uden den godkendelse er der intet
  build, intet `dist/` og dermed intet preview-link. Godkendelsen skal gives igen ved hvert
  nyt push fra Copilot.
  Selve godkendelseskravet kan slås fra én gang for alle under Settings → Code & automation
  → Copilot → cloud agent → "Actions workflow approval" → slå **Require approval for
  workflow runs** fra. Det giver ureviewet Copilot-kode adgang til repoets Actions-secrets
  (heriblandt deploy-nøgler); standarden er godkendelse.
- **PR'er fra forks får heller ikke et brugbart preview.** De kræver godkendelse af samme
  grund (Settings → Actions → General → fork pull request workflows), og uden repo-secrets
  kan hverken Convex-previewet eller frontend-buildet gennemføres.

## Ajour med `main`

- **Før du verificerer, tester, bygger et preview af eller melder status på en
  PR eller branch, så tjek altid, om den er bagud for `main`.** Kør fx
  `git fetch origin && git rev-list --count HEAD..origin/main`. Er tallet over
  0, så merge seneste `main` ind først (rebase, hvis branchen ikke er delt) og
  kør tjekkene igen. En forældet branch kan give misvisende resultater.
- **Reglen gælder også, når en agent tager en eksisterende branch op.** Bring
  den ajour med `main`, før der verificeres, testes, bygges preview eller
  meldes status.

## V2-previewets testbruger

- **Hvert PR-preview af V2 har én CI-testbruger, og medlemmer logger ind med deres sædvanlige Naturklubben-konto.** `pr-preview-v2.yml` kalder den interne action `previewSeed:ensure` efter `npx convex deploy --preview-name pr-<nr>`. Testbrugeren oprettes lokalt via Convex Auths adgangskode-provider, og der lægges et par aktiviteter og en offentlig tur ind, så appen kan prøves.
- **Medlemslogin på preview uden delt adgangskode (`V2/convex/previewMemberAuth.ts`):** På et preview falder `LoginPage.tsx` tilbage til Convex Auth-udbyderen `preview-member`, som server-til-server kalder produktionens `POST https://quaint-parakeet-652.convex.site/preview/verify-member` (rate-limiteret, konstant arbejde, afviser brugere uden profil eller med `deletionReservedAt`). Hvis produktion godkender, opretter/opdaterer `provisionVerifiedMember` den lokale bruger, `allowedEmails` og `profiles` (med `isAdmin` kopieret fra produktionsprofilen) og udsteder en lokal Convex Auth-session uden nogensinde at kopiere, gemme, hashe, returnere eller logge produktionsadgangskoden. Preview-frontendet taler fortsat kun med sit eget preview-deployment og dets seedede testdata.
- **`PREVIEW_SHARED_PASSWORD` er ikke længere påkrævet eller måden medlemmer logger ind på.** Hvis secreten findes, kan `previewSeed:ensure` stadig lægge den på de syv adresser i `PREVIEW_GUEST_ALLOWLIST` som valgfri fallback (Grok Bot er administrator, `kaspermoller+test` er ikke); mangler den, fortsætter previewet uden fejl. Den skrives aldrig ud i loggen eller committes.
- Adresse og adgangskode til testbrugeren er repo-secrets `PREVIEW_TEST_EMAIL` og `PREVIEW_TEST_PASSWORD`. Ingen ny secret er påkrævet. Workflowet sætter env-variabler på preview-deploymentet via stdin (`npx convex env set`), aldrig som argumenter og aldrig i loggen. `previewSeed:ensure` og `provisionVerifiedMember` kører kun, når `PREVIEW_SEED` er `1` og `CONVEX_CLOUD_URL` ikke er produktion. `deploy.yml` sætter ikke den fælles adgangskode.
- Seedet må ikke ramme produktion. Workflowet afviser en deploy-nøgle, der starter med `prod:`, og actionen nægter, hvis `CONVEX_CLOUD_URL` er produktions-deploymentet `quaint-parakeet-652`. `deploy-v2.yml` kalder det ikke. Samme trin sætter `JWT_PRIVATE_KEY` og `JWKS` på previewet, hvis de mangler. `deploy.yml` gør det samme på prod: Convex Auth kan ellers ikke udstede en session, og nøglerne følger ikke med fra et andet deployment. Uden dem hænger nulstillingslinket på "Et øjeblik…".
- Frontend-buildet får previewets URL som `VITE_CONVEX_URL` fra deployet. Workflowet fejler, hvis den byggede bundle peger på produktions-deploymentet.

## Nye funktioner meldes til medlemmerne

- **Hver ny funktion, medlemmerne kan mærke, tager sin egen nyhed med** (se
  `V2/convex/announcements.ts` og `V2/convex/tables/notifications.ts`). Skriv til
  medlemmerne, ikke til udviklere — hvad man kan gøre nu, ikke hvad der er refaktoreret.
- **Ændringer uden en oplevelse skal ikke have en nyhed**: refaktoreringer, rettelser i
  CI, tekstjusteringer. En notifikation er et afbrud i nogens dag, og en strøm af dem om
  ting, ingen kan se, gør, at den næste rigtige nyhed også bliver slået fra.

## Chat uden forbindelse

- Beskeder skrevet uden net lægges i en IndexedDB-kø og sendes af sig selv ved
  app-start, ved `online`-hændelsen og på kommando fra service workeren.
- Kølogikken skal blive liggende som rene funktioner i
  `V2/src/features/chat/offlineQueue.ts` -- ingen IndexedDB, netværk eller `navigator` i
  den fil. Det er den del, CI kan teste; browser-API'erne hører til i `useChatQueue.ts`
  og `offlineQueueStore.ts` ved siden af.

## App-version

- Appens version er **commit'en**, ikke et nummer nogen vedligeholder. `V2/vite.config.ts`
  kører `git describe --tags --always` + commit-datoen ved build og inliner resultatet;
  footeren viser det. Hæv derfor ikke `version` i `package.json` -- den bruges ikke.
- Tags er valgfri pynt: findes der et tag, viser footeren det (`v1.2.0`), ellers
  commit-sha'en. Derfor skal `deploy.yml` og `pr-preview-v2.yml` blive ved med at checke
  ud med `fetch-depth: 0` -- en shallow checkout uden tags kan `git describe` ikke bruge.

## Branch-oprydning

- `cleanup-branches.yml` sletter branches, hvis arbejde allerede er i `main`: PR'ens egen
  branch ryger, så snart PR'en merges (også ved squash-merge), og en ugentlig kørsel fejer
  resten op. Beskyttede branches, `main`, `gh-pages` og branches med en åben PR røres ikke.
- Den ugentlige kørsel rører kun branches, hvis seneste commit er mindst 7 dage gammel.
  Aldersgrænsen findes, fordi en nyoprettet branch uden egne commits peger på `main` og
  derfor teknisk set tæller som merged — uden grænsen ville den blive slettet under
  fødderne på den session, der lige har oprettet den.
- Skal der ryddes op med det samme, køres workflowet manuelt (Actions → Ryd op i merged
  branches → Run workflow) med `min_age_days` sat ned og evt. `dry_run` slået til først.
- **Slet aldrig branches ved at køre `git push origin --delete` manuelt.** Det er ikke en
  smagssag: sessionens git-proxy afviser ref-sletninger med HTTP 403, og skriveadgang til
  `git/refs` i GitHub's API er blokeret samme sted. Oprydning sker via workflowet, som
  kører i GitHub's egne runners.

## Secrets/nøgler

- **Klient** (bygges ind i V2-frontend): `VITE_CONVEX_URL` (leveres automatisk af
  `npx convex deploy --cmd ...` i `deploy.yml` og `pr-preview-v2.yml`) samt evt.
  `VITE_CONVEX_SITE_URL`. Aldrig deploy-nøgler eller server-hemmeligheder i klientkode.
- **Server-side / CI** (kun GitHub Actions og Convex-env):
  `CONVEX_DEPLOY_KEY` (prod), `CONVEX_PREVIEW_DEPLOY_KEY` (previews), `RESEND_API_KEY`,
  `PREVIEW_TEST_EMAIL`, `PREVIEW_TEST_PASSWORD` (samt valgfri `PREVIEW_SHARED_PASSWORD`).
- **Push-notifikationer (VAPID):** GitHub-secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
  og variablen `VAPID_SUBJECT` blev kun sat på de gamle Supabase Edge Functions af den
  nu fjernede `deploy-functions.yml`. **V2 bruger valgfri Convex-env (`V2/convex/convex.config.ts`)
  og ellers `ensureVapidKeys` i `V2/convex/pushSend.ts`, som selv genererer og gemmer
  nøgleparret i Convex (`pushVapidKeys`).** Slet ikke VAPID-secrets i GitHub eller felterne
  i `V2/convex/convex.config.ts`.
- **E-mail til gæster**: intet secret og ingen automatisk udsendelse. Et svar på en
  ansøgning om at deltage i en åben begivenhed sendes af arrangøren selv fra deres egen
  mailklient, via "Skriv til gæsten"-kladden i kalenderen (#239).
- **Tilbageværende Supabase-nøgler**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` og
  `VITE_SUPABASE_*` bruges ikke længere til produktion eller PR-previews, men slettes ikke
  i denne PR (bruges stadig af `migrate-v1.yml` indtil #379).

## Mappestruktur

```
V2/
  convex/      # produktions-backend på Convex (schema.ts, tables/, authz.ts, auth.ts, http.ts)
  src/         # produktions-frontend (pages, features, components, lib, sw-prod.ts)
  scripts/     # preview-smoke og V1-migration (migrateFromSupabase.mjs)
src/           # gammel V1-frontend (bevares indtil #379)
supabase/      # gammel V1-backend (bevares indtil #379)
```

## Faldgruber i frontend-tests og lint

- `oxlint`s `react(refs)`-regel ("Cannot access refs during render") flager en
  ref, der sættes i selve render-kroppen (mønsteret `fooRef.current = ...`
  brugt til at give en `queryFn` adgang til den nyeste liste uden at indgå i
  query-nøglen), _medmindre_ funktionen et andet sted har en
  `// eslint-disable-next-line react-hooks/exhaustive-deps`-kommentar foran en
  `useEffect`s deps-array -- uanset om den kommentar har noget med den ref at
  gøre. Mangler den kommentar, tilføj den ved den nærmeste `useEffect`, der
  bevidst udelader et stabilt lukket-over-værdi fra sin deps-liste, i stedet
  for at omstrukturere koden for at undgå advarslen.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
