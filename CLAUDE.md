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
- **PR-preview'et bygges mod PR'ens egen Supabase Preview Branch**, ikke mod produktion.
  `pr-preview.yml` slår branchen op i Supabase's Management API ud fra branch-navn/PR-nummer
  og bygger med dens URL og publishable key. Så de to preview-lag hænger automatisk sammen:
  UI'et fra preview-linket taler med den database, PR'ens egne migrationer er kørt på.
  Går opslaget galt, fejler preview-buildet med en fejlbesked -- det bygger **ikke** stille
  videre mod produktion (undtagen hvis secrets slet ikke er tilgængelige, fx en fork-PR,
  hvor det logges som en advarsel).
- Preview-databasen er tom bortset fra det, migrationerne opretter: ingen brugere, billeder
  eller beskeder. Skal en PR testes som logget ind, skal man oprette en bruger på selve
  preview'et.

## Secrets/nøgler

- **Klient** (bygges ind i frontend): `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
  Aldrig Secret key i klientkode.
- **Server-side** (kun Edge Functions): Supabase **Secret key** (`SUPABASE_SECRET_KEY`) —
  aldrig i klienten eller i build-workflowet til frontend.
- **Push-notifikationer** (kun Edge Functions): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
  og valgfrit `VAPID_SUBJECT`. Sættes som repo-secrets og skubbes videre som
  function-secrets af `deploy-functions.yml` — aldrig fra en terminal. Den offentlige
  nøgle bygges bevidst **ikke** ind i frontenden; klienten henter den fra
  `chat-push`-functionen, så nøglerne kan roteres uden et nyt frontend-build. Se
  `supabase/README.md`.
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
