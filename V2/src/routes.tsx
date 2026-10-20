import type { ReactNode } from 'react'
import StatusPage from './pages/StatusPage'

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
 * før `/kalender/:eventId`.
 */
export const appRoutes: AppRoute[] = [{ path: '/', element: <StatusPage /> }]
