import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/naturklubben/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Naturklubben',
        short_name: 'Naturklubben',
        description: 'Naturklubbens medlemsapp: kalender, billeder og chat.',
        start_url: '/naturklubben/',
        scope: '/naturklubben/',
        display: 'standalone',
        theme_color: '#166534',
        background_color: '#ffffff',
        // Rigtige ikoner (192/512/maskable) tilføjes i PWA-finish-issuet.
        icons: [],
      },
    }),
  ],
})
