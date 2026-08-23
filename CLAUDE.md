# Naturklubben — projektinstruktioner til Claude

Medlemsapp for Naturklubben. Frontend hostes statisk på GitHub Pages, backend er Supabase
(Postgres, Auth, Storage, Realtime, Edge Functions). Se GitHub-issue #1 for det fulde
epos/plan og #2–#15 for de nedbrudte delopgaver.

## Kerneprincip: alt udvikling skal kunne ske fra Claude-appen

Denne app udvikles primært af Claude (i Claude Code/Claude-appen), ikke fra en udviklers
lokale terminal. Derfor gælder:

- **Ingen trin i den løbende udvikling må kræve lokal Docker, lokal databasestak eller
  manuelle CLI-deploy-kommandoer kørt af et menneske.** Alt skal kunne udføres ved at
  skrive kode/SQL, committe og pushe/åbne PR.
- De **eneste** undtagelser er de to engangs-opsætningsopgaver, der kræver adgang til et
  dashboard i en browser: 🖐️ #2 (opret Supabase-projekt) og 🖐️ #3 (GitHub Pages-opsætning).
  De er allerede markeret som manuelle i deres respektive issues og udføres én gang af et
  menneske.
- Alt andet — migrations, edge functions, frontend, PWA, CI/CD-workflows — skrives og
  pushes som almindelig kode. Deploy sker automatisk via de integrationer, der opsættes i
  #2 og #3, aldrig ved at nogen manuelt kører en deploy-kommando.

## Database-migrations

- **Kør ALDRIG `supabase db push` eller anden manuel deploy-kommando mod
  produktionsdatabasen.**
- **Antag ALDRIG en lokal `supabase start`-Docker-stak til at validere migrations.** Det
  kræver lokalt værktøj, som ikke er en forudsætning for at kunne bidrage til projektet.
- Sådan laves en migration:
  1. Opret en ny SQL-fil i `supabase/migrations/` med navnekonventionen
     `<timestamp>_<beskrivelse>.sql`.
  2. Skriv SQL'en direkte i filen (ingen lokal kørsel nødvendig for at skrive den).
  3. Commit, push til en branch, og åbn PR mod `main`.
  4. Supabase's GitHub-integration (opsat i #2) opretter automatisk en midlertidig
     **Preview Branch**-database og kører migrationen der. Brug det midlertidige endpoint,
     som Supabase-botten poster i en PR-kommentar, til at validere SQL'en — ikke en lokal
     database.
  5. Ved merge til `main` deployer samme integration migrationen automatisk til
     produktionsdatabasen. Intet manuelt CLI-kald.
- **Slet aldrig en migrationsfil, der er kørt i produktion**, og omdøb den ikke
  bagefter. Supabase gemmer de kørte versionsnumre i databasen, og en fil, der
  forsvinder under et af dem, brækker senere migrationskørsler. Er en migration
  forkert, skrives en ny, der retter den. Rækkefølgen mellem versionsnumre er
  derimod ikke et problem i sig selv: en migration med et lavere nummer end det
  senest kørte bliver stadig anvendt ved merge.

## Edge Functions

- Deployes **ikke** manuelt fra en udviklers maskine.
- Deployes via en GitHub Actions-workflow (se #13), der kører `supabase functions deploy`
  ikke-interaktivt med `SUPABASE_ACCESS_TOKEN` som repo-secret. Dette kører i GitHub's
  cloud-runners ved push til `main` — ikke lokalt — og kræver derfor ikke, at et menneske
  sidder med CLI'en eller er logget ind interaktivt.

## Client (frontend) & PR-previews

- Al frontend-udvikling sker som almindelig kode (Vite/React/TypeScript), committes og
  pushes/åbnes som PR.
- Hver PR får automatisk et preview-link på GitHub Pages (`pr-preview/pr-<nr>/`) via
  CI/CD-workflowet i #5. Intet manuelt deploy-trin.
- Ved merge til `main` deployer samme CI/CD-workflow automatisk til den offentlige
  GitHub Pages-URL.
- **Rører PR'en `supabase/`, bygges preview'et mod PR'ens egen Supabase Preview Branch**,
  ikke mod produktion. `pr-preview.yml` slår branchen op i Supabase's Management API ud fra
  branch-navn/PR-nummer og bygger med dens URL og publishable key. Så de to preview-lag
  hænger automatisk sammen: UI'et fra preview-linket taler med den database, PR'ens egne
  migrationer er kørt på. Går opslaget galt, fejler preview-buildet med en fejlbesked -- det
  bygger **ikke** stille videre mod produktion.
- **Rører PR'en ikke `supabase/`, bygges preview'et mod produktionsdatabasen** -- med en
  synlig advarsel i job-loggen og i job-opsummeringen. Det er ikke en nødløsning, men den
  eneste mulige: Supabase's GitHub-integration opretter kun en Preview Branch for PR'er med
  ændringer i `supabase/`-mappen, og skriver ellers "This pull request has been ignored ...
  because there are no changes detected in `supabase` directory" i en PR-kommentar. En
  sådan PR indfører per definition ingen skemaændringer, så produktionsskemaet **er** PR'ens
  skema. Vent derfor ikke på et Supabase-preview-link på en ren frontend-PR, og lad være med
  at "fikse" workflowet, så det fejler på dem. Bemærk til gengæld, at preview'et af en ren
  frontend-PR taler med de rigtige produktionsdata.
  (Ønskes en branch på hver PR, kan opførslen ændres under Project Integrations Settings i
  Supabase-dashboardet -- det er et manuelt dashboard-trin og koster en branch pr. PR.
  Workflowet bruger automatisk branchen, hvis den findes.)
- Preview-databasen er tom bortset fra det, migrationerne opretter: ingen brugere, billeder
  eller beskeder. Skal en PR med migrationer testes som logget ind, skal man oprette en
  bruger på selve preview'et.
- **PR'er fra Copilot coding agent får ikke automatisk et preview-link — deres workflows
  skal godkendes manuelt.** Copilot åbner PR'en som sin egen GitHub App
  (`copilot-swe-agent`), ikke som en bruger med write-adgang, og GitHub behandler den
  derfor som en ekstern bidragyder: `ci.yml` og `pr-preview.yml` bliver oprettet, men
  starter aldrig — de står med status `action_required`, indtil et menneske trykker
  **"Approve and run workflows"** i PR'ens merge-boks. Uden den godkendelse er der intet
  build, intet `dist/` og dermed intet preview-link; den eneste check på PR'en er
  `Supabase Preview`, som Supabase-integrationen selv poster. Godkendelsen skal gives igen
  ved hvert nyt push fra Copilot. Det er ikke en fejl i workflowet — PR'er fra Claude Code
  pushes med brugerens eget token og kører derfor med det samme.
  Selve godkendelseskravet kan slås fra én gang for alle under Settings → Code & automation
  → Copilot → cloud agent → "Actions workflow approval" → slå **Require approval for
  workflow runs** fra. Det er et manuelt dashboard-trin, og det giver ureviewet
  Copilot-kode adgang til repoets Actions-secrets — her bl.a. `SUPABASE_ACCESS_TOKEN`, som
  kan læse produktionsprojektets nøgler. Afvej det bevidst; standarden er godkendelse.
- **PR'er fra forks får heller ikke et brugbart preview.** De kræver godkendelse af samme
  grund (Settings → Actions → General → fork pull request workflows), og selv godkendt
  fejler buildet med vilje: fork-PR'er får ingen secrets, så `VITE_SUPABASE_URL` og
  `VITE_SUPABASE_PUBLISHABLE_KEY` er tomme, og `vite.config.ts` afviser at udgive en
  app-løs bundle.

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

- **Klient** (bygges ind i frontend): `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
  Aldrig Secret key i klientkode.
- **Server-side** (kun Edge Functions): Supabase **Secret key** (`SUPABASE_SECRET_KEY`) —
  aldrig i klienten eller i build-workflowet til frontend.
- **Push-notifikationer** (kun Edge Functions): VAPID-nøgleparret kræver **ingen
  opsætning** — `chat-push` genererer det selv første gang og gemmer det i tabellen
  `push_vapid_keys`, som kun Secret key kan læse. Sæt derfor ikke repo-secrets for det;
  det ville være et manuelt dashboard-trin, som princippet ovenfor netop udelukker.
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` findes stadig som valgfri
  overstyring: er de sat som repo-secrets, skubber `deploy-functions.yml` dem videre som
  function-secrets, og de vinder over tabellen. Den offentlige nøgle bygges bevidst
  **ikke** ind i frontenden; klienten henter den fra `chat-push`, så nøglerne kan roteres
  uden et nyt frontend-build. Se `supabase/README.md`.
- **CI-only** (kun brugt af GitHub Actions, aldrig af en udvikler lokalt):
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` — bruges til at deploye Edge Functions
  ikke-interaktivt og til at slå PR'ens Preview Branch op, så preview-buildet rammer den
  rigtige database.
- Supabase er skiftet til det nye Publishable/Secret-nøglesystem (ikke de gamle
  `anon`/`service_role` JWT-nøgler) — se #2 for detaljer.
- `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` **skal** være sat i repoets
  Actions-indstillinger (Settings → Secrets and variables → Actions), som enten variable
  eller secrets — begge workflows læser begge steder. Uden dem inliner Vite tomme
  strenge, guarden i `src/lib/supabaseClient.ts` folder til et ubetinget `throw`, og hele
  app-grafen bliver tree-shaket væk: builder _lykkes_, men bundlen indeholder ingen app,
  er identisk fra commit til commit, og gh-pages får derfor intet nyt at committe.
  `vite.config.ts` fejler nu buildet i stedet for at udgive sådan en bundle.

## Mappestruktur (frontend)

```
src/
  pages/        # HeroPage, ActivitiesPage, CalendarPage, GalleryPage, ChatPage, LoginPage, ...
  components/    # delte UI-komponenter: Navbar, BurgerMenu, ...
  features/      # feature-specifik logik: auth, calendar, gallery, chat, notifications
  lib/           # supabaseClient.ts, queryClient.ts
  hooks/
  sw.ts          # service worker (vite-plugin-pwa injectManifest): precaching + push
supabase/
  migrations/    # SQL-migrations, deployes automatisk ved merge til main (se ovenfor)
  functions/     # Edge Functions, deployes via GitHub Actions (se #13)
```

## Relevante issues

- #1 — Byggeplan/epos
- #2 🖐️ — Manuel: Supabase-projekt (Publishable/Secret keys, GitHub-integration, Preview Branching)
- #3 🖐️ — Manuel: GitHub Pages + PR-previews
- #4 — Projekt-scaffold
- #5 — CI/CD: build + deploy (main + PR-previews)
- #6 — Database-skema & RLS
- #7 — Autentificering
- #8 — App-shell / burger-menu
- #9 — Hero-forside
- #10 — Aktivitetsside
- #11 — Kalender
- #12 — Billedgalleri
- #13 — Edge Function: billedoptimering
- #14 — Gruppechat
- #15 — PWA-finish
