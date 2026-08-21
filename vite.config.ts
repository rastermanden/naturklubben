import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Produktion bygger til roden af GitHub Pages-sitet (/naturklubben/).
// PR-preview-workflowet overstyrer denne til en pr-preview/pr-<nr>/-understi.
const basePath = process.env.VITE_BASE_PATH ?? '/naturklubben/'

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Naturklubben',
        short_name: 'Naturklubben',
        description: 'Naturklubbens medlemsapp: kalender, billeder og chat.',
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        theme_color: '#166534',
        background_color: '#ffffff',
        // Rigtige ikoner (192/512/maskable) tilføjes i PWA-finish-issuet.
        icons: [],
      },
    }),
  ],
})
