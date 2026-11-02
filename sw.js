// Erstatter en service worker, et ældre preview kan have registreret på
// /pr-preview/pr-<nr>/sw.js. Den tager over, sletter kun caches der hører
// til et preview, og afregistrerer sig selv, så næste indlæsning kommer
// fra netværket. Produktionens worker ligger på /sw.js og røres ikke.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((name) => name.includes('pr-preview'))
          .map((name) => caches.delete(name)),
      )
      await self.registration.unregister()
      const windows = await self.clients.matchAll({ type: 'window' })
      await Promise.all(
        windows
          .filter((client) => client.url.includes('/pr-preview/'))
          .map((client) => client.navigate(client.url)),
      )
    })(),
  )
})
