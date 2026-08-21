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
npm run lint            # oxlint
npm run format          # prettier --write
npm run format:check    # prettier --check
```

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
