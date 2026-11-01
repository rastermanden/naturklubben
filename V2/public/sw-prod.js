// Produktions-worker til "Installér app". Preview registrerer den ikke.
// Den har en fetch-handler, fordi Chromium ellers ikke tilbyder installation.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {})
