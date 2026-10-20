import type { ReactNode } from 'react'
import { authRoutes } from './features/auth/routes'
import { calendarRoutes } from './features/calendar/routes'
import { chatRoutes } from './features/chat/routes'
import { galleryRoutes } from './features/gallery/routes'
import { gameRoutes } from './features/games/routes'
import { notificationRoutes } from './features/notifications/routes'

export type AppRoute = {
  path: string
  element: ReactNode
}

/**
 * Samlingen af ruter.
 *
 * Hver feature eksporterer sin egen liste (`src/features/<domæne>/routes.tsx`)
 * og registreres her med én linje. Rækkefølgen betyder noget for dynamiske
 * stier: en statisk søskende skal stå før den dynamiske, fx `/kalender/offentlig`
 * før `/kalender/:eventId` -- det holder feature-filen styr på, her samles de
 * blot.
 */
export const appRoutes: AppRoute[] = [
  ...calendarRoutes,
  ...authRoutes,
  ...chatRoutes,
  ...galleryRoutes,
  ...notificationRoutes,
  ...gameRoutes,
]

