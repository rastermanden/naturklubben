import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Produktion bygger til roden af GitHub Pages-sitet (/naturklubben/).
// PR-preview-workflowet overstyrer denne til en pr-preview/pr-<nr>/-understi.
const basePath = process.env.VITE_BASE_PATH ?? '/naturklubben/'
const isProductionBuild = basePath === '/naturklubben/'

/** Kører en git-kommando og giver null, hvis git ikke kan svare. */
function git(args: string[]): string | null {
  try {
    return (
      execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null
    )
  } catch {
    return null
  }
}

/**
 * Finder den version, appen viser i footeren.
 *
 * Kilden er commit'en, ikke et versionsnummer i package.json: hver merge til
 * main deployer, så commit'en *er* udgivelsen, og et nummer, nogen skal huske
 * at hæve, ville kun være rigtigt indtil første gang det blev glemt.
 *
 * `git describe --tags --always` giver den korte commit-sha, når der ingen
 * tags er, og tagget (fx `v1.2.0` eller `v1.2.0-3-gabc1234`), hvis nogen
 * senere begynder at tagge. Tags virker altså uden at være et krav -- de
 * pynter bare på strengen, når de findes. Det forudsætter, at workflowene
 * checker ud med `fetch-depth: 0`, ellers er der hverken tags eller historik
 * at beskrive ud fra, og vi falder tilbage til commit-sha'en fra GITHUB_SHA.
 */
function resolveAppVersion(basePath: string) {
  const described =
    git(['describe', '--tags', '--always', '--dirty']) ??
    process.env.GITHUB_SHA?.slice(0, 7) ??
    'ukendt'

  // Commit-datoen frem for byggetidspunktet: to builds af samme commit er
  // samme version, og datoen svarer til det, man ser i git-historikken.
  const commitDate =
    git(['log', '-1', '--format=%cI']) ?? new Date().toISOString()

  // PR-previews ligger i undermapper af produktionssitet. Uden mærkatet er der
  // ingen måde at se på selve appen, om man kigger på et preview eller på den
  // rigtige side.
  const previewNumber = basePath.match(/pr-preview[/]pr-([0-9]+)[/]/)?.[1]

  return {
    version: previewNumber ? `PR #${previewNumber} · ${described}` : described,
    date: commitDate,
  }
}

const appVersion = resolveAppVersion(basePath)

/**
 * Stopper et build, hvis Supabase-env'et mangler.
 *
 * Uden dette tjek fejler et build ikke -- det bliver stille ubrugeligt:
 * `import.meta.env.VITE_*` inlines som tomme strenge, guarden i
 * src/lib/supabaseClient.ts folder til et ubetinget `throw`, og
 * tree-shakingen smider hele app-grafen bagefter væk. Resultatet er en
 * bundle uden app (kun Supabase-vendorkode + throw'et), som er byte-identisk
 * fra commit til commit. Deployet "lykkes" derfor, men gh-pages får intet nyt
 * at committe ("nothing to commit, working tree clean") og står stille, mens
 * den udgivne side er hvid.
 */
function assertSupabaseEnv(mode: string) {
  // loadEnv samler både .env-filer og VITE_-variabler fra process.env
  // (dvs. dem CI injicerer som env på build-steppet).
  const env = loadEnv(mode, process.cwd())
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(
    (name) => !env[name],
  )

  if (missing.length > 0) {
    throw new Error(
      `Manglende build-env: ${missing.join(', ')}.\n` +
        'Et build uden disse producerer en tom app-bundle, ikke en fejl -- ' +
        'derfor stopper vi her.\n' +
        'Lokalt: kopiér .env.example til .env.local og udfyld den.\n' +
        'I GitHub Actions: sæt dem som repository secrets/variables ' +
        '(Settings -> Secrets and variables -> Actions).',
    )
  }
}

/**
 * Udgiver en 404.html ved siden af index.html.
 *
 * GitHub Pages serverer kun filer, der findes: en direkte navigation til fx
 * /naturklubben/velkommen (skrevet ind, delt som link eller klikket i en mail
 * fra Supabase) findes ikke på disken og besvares med GitHubs egen
 * "There isn't a GitHub Pages site here"-404 -- appen bliver aldrig indlæst.
 * En 404.html får lov at overtage det svar, og herfra kan vi sende browseren
 * videre til app'ens index.html med stien i behold.
 *
 * Filen genereres frem for at ligge i public/, fordi den skal kende sin egen
 * base-sti, og den er forskellig for produktion og PR-previews.
 *
 * Scriptet nedenfor står i en template literal, hvor JavaScript selv spiser
 * backslashes (`\d` bliver til `d`). Derfor er regexerne skrevet med
 * tegnklasser -- `[/]`, `[0-9]`, `[.]` -- i stedet for `\/`, `\d` og `\.`.
 */
function spaFallback(basePath: string): Plugin {
  const html = `<!doctype html>
<html lang="da">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Naturklubben</title>
    <script>
      ;(function () {
        var base = ${JSON.stringify(basePath)}
        var path = location.pathname
        if (path.indexOf(base) !== 0) {
          location.replace(base)
          return
        }
        var rest = path.slice(base.length)

        // PR-previews ligger i undermapper af produktionssitet og har deres
        // eget build med deres egen base. Havner en preview-sti her, skal den
        // sendes til previewets index.html -- ikke produktionens.
        var preview = rest.match(/^pr-preview[/]pr-[0-9]+[/]/)
        if (preview) {
          base += preview[0]
          rest = rest.slice(preview[0].length)
        }

        // Ligner stien en fil (fx et billede, der er blevet væk), er det ikke
        // en rute i appen, og så er en viderestilling bare forvirrende.
        if (/[.][^/]+$/.test(rest)) return

        // Kun stien pakkes ind: query og fragment skal blive rigtige dele af
        // URL'en, for det er dér, Supabase lægger sessionen fra et mail-link.
        var query = location.search ? location.search.slice(1) + '&' : ''
        location.replace(
          base +
            '?' +
            query +
            'spa-path=' +
            encodeURIComponent(rest) +
            location.hash,
        )
      })()
    </script>
  </head>
  <body>
    <p>
      Siden findes ikke. <a href="${basePath}">Gå til Naturklubben</a>.
    </p>
  </body>
</html>
`

  return {
    name: 'naturklubben:spa-404-fallback',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '404.html', source: html })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    assertSupabaseEnv(mode)
  }

  return {
    base: basePath,
    // Versionen inlines ved build, så appen kan vise præcis hvilket build der
    // kører -- se src/lib/appVersion.ts.
    define: {
      __APP_VERSION__: JSON.stringify(appVersion.version),
      __APP_BUILD_DATE__: JSON.stringify(appVersion.date),
    },
    plugins: [
      react(),
      tailwindcss(),
      spaFallback(basePath),
      // PWA/service worker kun i produktion. På PR-previews giver en service
      // worker ingen værdi og risikerer at cache et build fast på en URL, som
      // senere genbruges af en helt anden PR-preview eller produktion selv
      // (samme origin) -- det gav tidligere en hvid side pga. en forældet
      // cachet bundle, der ikke matchede den aktuelle base-path/router.
      ...(isProductionBuild
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              // injectManifest frem for den genererede service worker: kun en
              // service worker, vi selv skriver, kan have `push`- og
              // `notificationclick`-handlers, og det er dem, der giver
              // notifikationer på telefonen ved nye chatbeskeder (#14).
              // Caching-opsætningen, der før stod i `workbox` herunder, er
              // flyttet 1:1 til src/sw.ts.
              strategies: 'injectManifest',
              srcDir: 'src',
              filename: 'sw.ts',
              // favicon.ico/favicon.svg/apple-touch-icon.png refereres kun
              // via <link> i index.html, ikke manifestets icons-liste --
              // skal derfor eksplicit bedes precachet.
              includeAssets: [
                'favicon.ico',
                'favicon.svg',
                'apple-touch-icon.png',
              ],
              // Uden dette registreres der ingen service worker under
              // `npm run dev` -- installer-knappen (beforeinstallprompt)
              // kræver én, så den ville aldrig dukke op lokalt i dev.
              devOptions: {
                enabled: true,
                type: 'module',
              },
              manifest: {
                name: 'Naturklubben',
                short_name: 'Naturklubben',
                description:
                  'Naturklubbens medlemsapp: kalender, billeder og chat.',
                start_url: basePath,
                scope: basePath,
                display: 'standalone',
                theme_color: '#166534',
                background_color: '#ffffff',
                icons: [
                  {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'maskable-icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
              },
            }),
          ]
        : []),
    ],
  }
})
