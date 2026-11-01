// Produktions-worker: installation og push. Preview registrerer den også,
// så notifikationer kan prøves, men viser ikke "Installér app".
const basePath = new URL('./', self.location.href).pathname

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'Naturklubben'
  const options = {
    body: payload.body || 'Der er skrevet noget nyt i chatten.',
    icon: `${basePath}pwa-192x192.png`,
    badge: `${basePath}pwa-192x192.png`,
    tag: payload.tag || 'naturklubben-chat',
    renotify: true,
    data: { url: new URL(payload.path || 'chat', self.location.origin + basePath).href },
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of windows) {
        client.postMessage({ type: 'push', title, body: options.body })
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data && event.notification.data.url
  event.waitUntil(self.clients.openWindow(target || self.location.origin + basePath))
})
