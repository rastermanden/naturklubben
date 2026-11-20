// Denne fil ligger på /sw.js, som var V1's worker. Når browseren opdaterer
// den gamle registrering, skal den slippe V1's cache og genindlæse siden,
// så oprettelse rammer V2 og ikke Supabase. Derefter afmelder den sig.
// Appen selv registrerer /sw-prod.js.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((name) => caches.delete(name)))
      const windows = await self.clients.matchAll({ type: 'window' })
      await Promise.all(windows.map((client) => client.navigate(client.url)))
      await self.registration.unregister()
    })(),
  )
})
