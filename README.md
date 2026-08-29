# Naturklubben

[![Deploy to GitHub Pages](https://github.com/rastermanden/naturklubben/actions/workflows/deploy.yml/badge.svg)](https://github.com/rastermanden/naturklubben/actions/workflows/deploy.yml)

Medlemsapp for Naturklubben — hero-forside, aktivitetsside, og bag login: kalender,
billedgalleri og gruppechat. Se GitHub-issue #1 for den fulde plan og `CLAUDE.md` for
projektets udviklingskonventioner.

## Teknologi

Vite + React + TypeScript + Tailwind CSS, React Router, TanStack Query,
`@supabase/supabase-js`, `vite-plugin-pwa`. Backend er Supabase (Postgres, Auth, Storage,
Realtime, Edge Functions).

## Kom i gang lokalt

```bash
npm install
cp .env.example .env.local   # udfyld med værdier fra Supabase, se CLAUDE.md/issue #2
npm run dev
```

Appen kører som udgangspunkt på `http://localhost:5173/naturklubben/` (bemærk sti-delen —
den matcher produktionens GitHub Pages-sti).

## Andre kommandoer

```bash
npm run build         # typecheck + produktionsbuild til dist/
npm run preview        # server dist/ lokalt
npm test               # deterministiske komponent- og logiktests
npm run lint            # oxlint
npm run format          # prettier --write
npm run format:check    # prettier --check
```

## Tests

`npm test` kører Vitest én gang i jsdom uden browser, netværk, lokal Supabase eller
produktionsdata. Testfiler ligger ved den kode, de dækker, som `*.test.ts` eller
`*.test.tsx`.

Foretræk ren logik som kalenderens iCal-generator. Når en komponent afhænger af en ekstern
grænse, gives kontrollerede testdata gennem den nærmeste provider eller et mock af selve
grænsen; `ProtectedRoute.test.tsx` viser provider-mønsteret for auth. Kald aldrig den
rigtige Supabase-klient fra en test. CI kører samme `npm test` på pull requests og `main`.

## App-version

Footeren viser, hvilket build der kører, fx `Version 37a86ae · 29.08.2026`. Strengen
kommer fra `git describe --tags --always` og commit-datoen, og inlines ved build af
`vite.config.ts` (se `src/lib/appVersion.ts`).

Der er bevidst **ingen** manuelt vedligeholdt version i `package.json` og ingen krav om
tags: hver merge til `main` deployer, så commit'en _er_ udgivelsen. Vil man alligevel
markere en milepæl, koster det ikke andet end at sætte et tag på `main` -- så viser
footeren tagget (`v1.2.0`) i stedet for sha'en, og `v1.2.0-3-gabc1234` for de commits, der
kommer efter. Derfor checker `deploy.yml` og `pr-preview.yml` ud med `fetch-depth: 0`.

Preview-builds får deres PR-nummer med i strengen (`Version PR #123 · abc1234 · ...`), så
man kan se på selve appen, at man ikke er på produktionssitet.

## Links fra mails og dybe links

Bekræftelses- og nulstillingsmails fra Supabase lander på `/velkommen` og
`/ny-adgangskode` i appen. GitHub Pages har ingen SPA-fallback, så buildet udgiver en
`404.html`, der sender vilkårlige stier videre til `index.html` med sti, query og
fragment i behold. Hvilke URL'er Supabase overhovedet må sende folk hen til, styres af
`.github/workflows/sync-auth-config.yml` -- se `supabase/README.md`.

## Dokumentation

- [`docs/kodegennemgang-2026-08-23.md`](docs/kodegennemgang-2026-08-23.md) — gennemgang af
  hele appen: arkitektur, styrker, fund og roadmap. Fundene er oprettet som issues med
  labels `blocker`, `risiko`, `friktion` og `finish`.
- `CLAUDE.md` — projektets udviklingskonventioner.
- `supabase/README.md` — backend-opsætning, nøgler og auth-URL'er.

## Mappestruktur

```
src/
  pages/       # side-komponenter (HeroPage, ActivitiesPage, CalendarPage, ...)
  components/  # delte UI-komponenter (tilføjes efterhånden, se issue #8)
  features/    # feature-specifik logik (auth, calendar, gallery, chat)
  lib/         # supabaseClient.ts, queryClient.ts
  hooks/       # delte React hooks
supabase/
  migrations/  # SQL-migrations — deployes automatisk ved merge til main, se CLAUDE.md
  functions/   # Edge Functions — deployes via GitHub Actions, se CLAUDE.md
```
