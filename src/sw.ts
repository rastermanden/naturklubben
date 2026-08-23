/// <reference lib="webworker" />
//
// Egen service worker (vite-plugin-pwa `injectManifest`).
//
// Vi genererede den tidligere med `generateSW`, men en genereret service
// worker kan ikke få egne event-handlers -- og push-notifikationer (#14)
// findes kun her: `push` og `notificationclick` leveres til service workeren,
// også når appen er helt lukket. Derfor er caching-opsætningen nedenfor en
// 1:1-oversættelse af den tidligere workbox-konfiguration i vite.config.ts,
// plus de to push-handlers.

import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[]
}

// Service workeren udgives i roden af build-output og serveres derfor fra
// app'ens base-path (/naturklubben/ i produktion). At udlede base'en af dens
// egen URL frem for at inline den betyder, at filen er korrekt uanset hvilken
// sti buildet er lagt under.
const basePath = new URL('./', self.location.href).pathname

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Precacher app-shellen (HTML/JS/CSS/ikoner), så appen stadig åbner og viser
// en meningsfuld tilstand offline -- hver sides egne loading/fejl-tilstande
// tager over for data, der ikke er hentet endnu.
//
// Produktions-service-workeren har scope /naturklubben/ og fanger derfor ALLE
// navigationer derunder -- også /naturklubben/pr-preview/pr-<nr>/. Uden denne
// denylist besvarer NavigationRoute en preview-URL med produktionens egen
// precachede index.html, så preview'ets index.html og bundle aldrig hentes:
// previewet bliver hvidt for alle, der har været forbi forsiden én gang og
// dermed har SW'en installeret.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${basePath}index.html`), {
    denylist: [new RegExp(`^${basePath}pr-preview/`)],
  }),
)

// Optimerede/originale billeder fra Supabase Storage -- stale-while-revalidate,
// så tidligere sete billeder vises med det samme selv offline, og opdateres i
// baggrunden næste gang der er netværk.
registerRoute(
  ({ url }) =>
    url.protocol === 'https:' &&
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/storage/v1/object/public/'),
  new StaleWhileRevalidate({
    cacheName: 'supabase-storage-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  /** Sti relativ til app'ens base, fx "chat". */
  path?: string
  messageId?: string
}

// `renotify` og `vibrate` findes i alle browsere, der understøtter Web Push,
// men er ikke med i TypeScripts NotificationOptions.
type PushNotificationOptions = NotificationOptions & {
  renotify?: boolean
  vibrate?: number[]
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

  const options: PushNotificationOptions = {
    body: payload.body ?? 'Der er skrevet noget nyt i chatten.',
    icon: `${basePath}pwa-192x192.png`,
    badge: `${basePath}pwa-192x192.png`,
    // Samme tag -> en ny besked erstatter den forrige notifikation i stedet
    // for at lægge sig oven på den. renotify sørger for, at telefonen stadig
    // giver lyd/vibration, når den erstattes.
    tag: payload.tag ?? 'naturklubben-chat',
    renotify: true,
    data: { url: url.href, messageId: payload.messageId },
  }

  event.waitUntil(
    self.registration.showNotification(
      payload.title ?? 'Naturklubben',
      options,
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url
  const url = target ?? `${self.location.origin}${basePath}chat`

  // Har brugeren appen åben i forvejen, skal vi bruge det vindue frem for at
  // åbne endnu et -- ellers ender man med en stak af app-vinduer efter hver
  // notifikation.
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
