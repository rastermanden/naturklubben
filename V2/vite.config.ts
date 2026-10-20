import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * V2 er en Convex-native omskrivning af Naturklubben. Den ligger ved siden af
 * den nuværende Supabase-app og har sit eget build, så de to kan deployes hver
 * for sig -- se V2/README.md, "Skift mellem de to apps".
 *
 * Standardstien er /naturklubben/v2/, så V2 kan ligge på samme GitHub
 * Pages-site som den nuværende app uden at overskrive den. Sæt
 * VITE_BASE_PATH=/naturklubben/ for at lægge V2 på produktions-URL'en.
 */
const basePath = process.env.VITE_BASE_PATH ?? '/naturklubben/v2/'

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
  const commitDate = git(['log', '-1', '--format=%cI']) ?? new Date().toISOString()
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
 * /naturklubben/v2/kalender findes ikke på disken og besvares med GitHubs
 * egen 404. Filen her overtager svaret og sender stien videre til index.html.
 */
function spaFallback(path: string): Plugin {
  const html = `<!doctype html>
<html lang="da">
  <head>
    <meta charset="UTF-8" />
    <title>Naturklubben</title>
    <script>
      ;(function () {
        var base = ${JSON.stringify(path)}
        var path = location.pathname
        if (path.indexOf(base) !== 0) {
          location.replace(base)
          return
        }
        var rest = path.slice(base.length)
        if (/[.][^/]+$/.test(rest)) return
        var query = location.search ? location.search.slice(1) + '&' : ''
        location.replace(
          base + '?' + query + 'spa-path=' + encodeURIComponent(rest) + location.hash,
        )
      })()
    </script>
  </head>
  <body>
    <p>Siden findes ikke. <a href="${path}">Gå til Naturklubben</a>.</p>
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
