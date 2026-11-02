/// <reference lib="webworker" />
//
// Produktions-worker. Samme cache som den nuværende apps `src/sw.ts`:
// precache af app-shellen, navigations-fallback til index.html (preview-stier
// undtaget), og stale-while-revalidate af billeder. Push og klik på en
// notifikation er med, så en lukket app stadig kan vise beskeden.
//
// Billedcachen peger på Convex filstorage i stedet for Supabase. Der er ingen
// Supabase-billeder i V2.

import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import {
  CHAT_QUEUE_FLUSH_MESSAGE,
  CHAT_QUEUE_SYNC_TAG,
} from './lib/chatQueueSync'
import { isCachedImageRequest, previewNavigationPattern } from './lib/swCache'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

const basePath = new URL('./', self.location.href).pathname

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${basePath}index.html`), {
    denylist: [previewNavigationPattern(basePath)],
  }),
)

registerRoute(
  ({ url }) => isCachedImageRequest(url),
  new StaleWhileRevalidate({
    cacheName: 'convex-storage-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

interface ChatQueueSyncEvent extends ExtendableEvent {
  readonly tag: string
}

const syncListener = (event: ChatQueueSyncEvent) => {
  if (event.tag !== CHAT_QUEUE_SYNC_TAG) return
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of clients) {
        client.postMessage({ type: CHAT_QUEUE_FLUSH_MESSAGE })
      }
    })(),
  )
}

self.addEventListener('sync', syncListener as EventListener)

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  path?: string
  messageId?: string
}

type PushNotificationOptions = NotificationOptions & {
  renotify?: boolean
}

function parsePayload(event: PushEvent): PushPayload {
  if (!event.data) return {}
  try {
    return event.data.json() as PushPayload
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event)
  const url = new URL(
    payload.path ?? 'chat',
    `${self.location.origin}${basePath}`,
  )
  const title = payload.title ?? 'Naturklubben'
  const body = payload.body ?? 'Der er skrevet noget nyt i chatten.'
  const options: PushNotificationOptions = {
    body,
    icon: `${basePath}pwa-192x192.png`,
    badge: `${basePath}pwa-192x192.png`,
    tag: payload.tag ?? 'naturklubben-chat',
    renotify: true,
    data: { url: url.href, messageId: payload.messageId },
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      // Den åbne fane bruger beskeden til at vise, at push nåede frem.
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of windows) {
        client.postMessage({ type: 'push', title, body })
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url
  const url = target ?? `${self.location.origin}${basePath}chat`

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const existing = windows.find((client) =>
        client.url.startsWith(`${self.location.origin}${basePath}`),
      )
      if (existing) {
        await existing.focus()
        if ('navigate' in existing) await existing.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
