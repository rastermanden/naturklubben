import { ConvexReactClient } from 'convex/react'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error(
    'Mangler VITE_CONVEX_URL. Se V2/.env.example og V2/README.md.',
  )
}

/**
 * Én klient for hele appen. Convex-klienten holder selv WebSocket-forbindelsen
 * og genopretter den, så der er ingen separat realtime-kanal at abonnere på:
 * et `useQuery` er abonnementet.
 */
export const convex = new ConvexReactClient(convexUrl)
