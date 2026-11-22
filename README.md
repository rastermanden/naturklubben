# Naturklubben

[![Deploy to GitHub Pages](https://github.com/rastermanden/naturklubben/actions/workflows/deploy.yml/badge.svg)](https://github.com/rastermanden/naturklubben/actions/workflows/deploy.yml)

Medlemsapp for Naturklubben på `https://naturklubben.dk` — hero-forside,
aktivitetsside, offentlig kalender for ikke-medlemmer (#224), og bag login:
kalender, billedgalleri, gruppechat, naturlog, spil og medlemsprofil. Se `AGENTS.md`
for projektets udviklingskonventioner (`CLAUDE.md` importerer samme fil) og
[`V2/README.md`](V2/README.md) for detaljer om produktionsappen.

## Teknologi

Produktionen på `https://naturklubben.dk` kører **V2** i `V2/`: Vite + React +
TypeScript + Tailwind CSS, React Router, Convex (`quaint-parakeet-652`),
`@convex-dev/auth` og `vite-plugin-pwa`. Frontend udgives statisk til GitHub
Pages (`V2/dist` via `.github/workflows/deploy.yml`).

> **Overgang fra V1/Supabase (#378 / #379 / #315):** Produktionen kører nu udelukkende
> på V2/Convex (`quaint-parakeet-652`). V1-byggepipelinen (#378) samt V1-koden (`src/`,
> `supabase/`), `migrate-v1.yml`, `V2/scripts/migrateFromSupabase.mjs` og V1-rodconfig
> (#379) er fjernet.
>
> **Vigtigt om Supabase-projektet:** Fjernelsen af `deploy-functions.yml` og
> `supabase/` stopper kun kode og nye deploys i repoet; de 14 aktive Edge Functions på
> Supabase-projektet bliver ved med at køre, indtil Martin selv pauser eller sletter
> projektet. Ingen GitHub-secrets (heller ikke `VAPID_*` eller `SUPABASE_*`) er slettet
> i denne PR.

## Kom i gang lokalt (V2)

```bash
cd V2
npm install
npx convex dev   # logger ind, sætter VITE_CONVEX_URL i V2/.env.local og genererer convex/_generated/
npm run dev
```

Se [`V2/README.md`](V2/README.md) og [`V2/.env.example`](V2/.env.example) for
miljøvariabler og opsætning.

## Andre kommandoer (i `V2/`)

```bash
npm run build             # typecheck + produktionsbuild til V2/dist/
npm run preview           # server V2/dist/ lokalt
npm test                  # Vitest + convex-test
npm run lint              # oxlint
npx tsc -b                # TypeScript-check (app, convex, node, worker)
npx prettier --check .    # Prettier-tjek for V2/
```

## Tests

`cd V2 && npm test` kører Vitest og `convex-test` uden netværk, browser eller
produktionsdata. Testfiler ligger ved den kode, de dækker, som `*.test.ts` eller
`*.test.tsx`. CI (`.github/workflows/ci.yml`) kører `npm test`, `npm run lint`,
`npx tsc -b` og `npx prettier --check .` i `V2/` på pull requests og `main`.

## App-version

Footeren viser, hvilket build der kører, fx `Version 37a86ae · 29.08.2026`.
Strengen kommer fra `git describe --tags --always` og commit-datoen og inlines
ved build af `V2/vite.config.ts` (se `V2/src/lib/appVersion.ts`).

Der er bevidst **ingen** manuelt vedligeholdt version i `package.json` og ingen
krav om tags: hver merge til `main` deployer, så commit'en _er_ udgivelsen.
Derfor checker `deploy.yml` og `pr-preview-v2.yml` ud med `fetch-depth: 0`.

Preview-builds får deres PR-nummer med i strengen (`Version PR #123 · abc1234 · ...`),
så man kan se på selve appen, at man ikke er på produktionssitet.

## Links fra mails og dybe links

Bekræftelses- og nulstillingsmails fra Convex Auth (via Resend) lander på
`/velkommen` og `/ny-adgangskode` i appen. GitHub Pages har ingen SPA-fallback,
så buildet udgiver en `404.html`, der sender vilkårlige stier videre til
`index.html` med sti, query og fragment i behold. Push-notifikationer om
kalenderen åbner på samme måde `/kalender/<id>` direkte.

## Dokumentation

- [`V2/README.md`](V2/README.md) — produktionsappen (Convex, auth, mails,
  previews og verifikation).
- `VISION.md` — hvorfor appen findes, og de principper hver ændring tjekkes imod.
- `FLOW.md` — arbejdsgangen for hver ændring, fra observation til udgivelse.
- `.agents/skills/` — skills til coding agents, delt af alle modeller
  (`.claude/skills` er et symlink hertil). Se `AGENTS.md`.
- `AGENTS.md` — projektets udviklingskonventioner. `CLAUDE.md` importerer samme fil.

## Mappestruktur

```
V2/
  convex/      # produktions-backend på Convex (schema, tabeller, auth, HTTP-ruter)
  src/         # produktions-frontend (pages, features, components, lib)
  scripts/     # preview-smoke og driftsscripts
```
