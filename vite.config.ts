import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Produktion bygger til roden af GitHub Pages-sitet (/naturklubben/).
// PR-preview-workflowet overstyrer denne til en pr-preview/pr-<nr>/-understi.
const basePath = process.env.VITE_BASE_PATH ?? '/naturklubben/'
const isProductionBuild = basePath === '/naturklubben/'

// https://vite.dev/config/
export default defineConfig({
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
              // Rigtige ikoner (192/512/maskable) tilføjes i PWA-finish-issuet.
              icons: [],
            },
          }),
        ]
      : []),
  ],
})
