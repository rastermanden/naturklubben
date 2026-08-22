import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Produktion bygger til roden af GitHub Pages-sitet (/naturklubben/).
// PR-preview-workflowet overstyrer denne til en pr-preview/pr-<nr>/-understi.
const basePath = process.env.VITE_BASE_PATH ?? '/naturklubben/'
const isProductionBuild = basePath === '/naturklubben/'

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

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    assertSupabaseEnv(mode)
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      // PWA/service worker kun i produktion. På PR-previews giver en service
      // worker ingen værdi og risikerer at cache et build fast på en URL, som
      // senere genbruges af en helt anden PR-preview eller produktion selv
      // (samme origin) -- det gav tidligere en hvid side pga. en forældet
      // cachet bundle, der ikke matchede den aktuelle base-path/router.
      ...(isProductionBuild
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              // favicon.svg/apple-touch-icon.png refereres kun via <link> i
              // index.html, ikke manifestets icons-liste -- skal derfor
              // eksplicit bedes precachet.
              includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
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
              workbox: {
                // Precacher app-shellen (HTML/JS/CSS/ikoner), så appen stadig
                // åbner og viser en meningsfuld tilstand offline -- hver sides
                // egne loading/fejl-tilstande tager over for data, der ikke er
                // hentet endnu.
                navigateFallback: `${basePath}index.html`,
                runtimeCaching: [
                  {
                    // Optimerede/originale billeder fra Supabase Storage --
                    // stale-while-revalidate, så tidligere sete billeder vises
                    // med det samme selv offline, og opdateres i baggrunden
                    // næste gang der er netværk.
                    urlPattern:
                      /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/.*/,
                    handler: 'StaleWhileRevalidate',
                    options: {
                      cacheName: 'supabase-storage-images',
                      expiration: {
                        maxEntries: 200,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                      },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                ],
              },
            }),
          ]
        : []),
    ],
  }
})
