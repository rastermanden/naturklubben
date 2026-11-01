import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { computeSpaFallback } from './src/lib/spaFallback.js'

/**
 * V2 er en Convex-native omskrivning af Naturklubben. Den ligger ved siden af
 * den nuværende Supabase-app og har sit eget build, så de to kan deployes hver
 * for sig -- se V2/README.md, "Skift mellem de to apps".
 *
 * Sitet er naturklubben.dk, serveret fra roden. Standardstien er /v2/, så V2
 * kan ligge ved siden af den nuværende app uden at overskrive den.
 * PR-preview-workflowet sætter VITE_BASE_PATH til /pr-preview/pr-<nr>/.
 * Sæt VITE_BASE_PATH=/ for at lægge V2 på produktions-URL'en.
 */
const basePath = process.env.VITE_BASE_PATH ?? '/v2/'

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

/** Samme version som den nuværende app: commit'en er udgivelsen. */
function resolveAppVersion() {
  const described =
    git(['describe', '--tags', '--always', '--dirty']) ??
    process.env.GITHUB_SHA?.slice(0, 7) ??
    'ukendt'
  const commitDate =
    git(['log', '-1', '--format=%cI']) ?? new Date().toISOString()
  return { version: `V2 · ${described}`, date: commitDate }
}

const appVersion = resolveAppVersion()

/**
 * Stopper buildet, hvis Convex-adressen mangler.
 *
 * Samme fælde som i den nuværende app: uden env inlines en tom streng, klienten
 * kaster ved første kald, og tree-shakingen kan efterlade en bundle uden app.
 * Et grønt build, der udgiver en hvid side, er værre end et rødt build.
 */
function assertConvexEnv(mode: string) {
  const env = loadEnv(mode, process.cwd())
  if (!env.VITE_CONVEX_URL) {
    throw new Error(
      'Mangler build-env: VITE_CONVEX_URL.\n' +
        'Lokalt: kopiér .env.example til .env.local og udfyld den.\n' +
        'I GitHub Actions: sæt den som repository variable/secret ' +
        '(Settings -> Secrets and variables -> Actions).',
    )
  }
}

/**
 * GitHub Pages har ingen SPA-fallback. En direkte navigation til fx
 * /v2/kalender findes ikke på disken og besvares med GitHubs egen 404.
 * Filen her overtager svaret og sender stien videre til index.html.
 *
 * Samme mønster som rod-appens `vite.config.ts`: kender sin egen base-sti,
 * og en preview-sti, der rammer en 404 med base `/`, sendes til previewets
 * index.html. Scriptet står i en template literal, så regexerne bruger
 * tegnklasser (`[/]`, `[0-9]`, `[.]`) i stedet for skråstreger, som
 * JavaScript selv ville spise.
 */
function spaFallback(basePath: string): Plugin {
  const html = `<!doctype html>
<html lang="da">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Naturklubben</title>
    <script>
      ${computeSpaFallback.toString()}
      ;(function () {
        var target = computeSpaFallback(
          ${JSON.stringify(basePath)},
          location.pathname,
          location.search,
          location.hash,
        )
        if (target !== null) location.replace(target)
      })()
    </script>
  </head>
  <body>
    <p>Siden findes ikke. <a href="${basePath}">Gå til Naturklubben</a>.</p>
  </body>
</html>
`

  return {
    name: 'naturklubben-v2:spa-404-fallback',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '404.html', source: html })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertConvexEnv(mode)

  return {
    base: basePath,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion.version),
      __APP_BUILD_DATE__: JSON.stringify(appVersion.date),
    },
    plugins: [react(), tailwindcss(), spaFallback(basePath)],
  }
})
