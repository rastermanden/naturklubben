import type { AppRoute } from '../../routes'
import { ProtectedRoute } from '../auth'
import NewsPage from '../../pages/NewsPage'
import ProbationApplicationPage from '../../pages/ProbationApplicationPage'

/**
 * Ruterne for notifikationer, nyheder, prøvemedlemskab og konto.
 *
 * `AppRoute` har kun en sti og et element, så beskyttelsen er en indpakning om
 * elementet og ikke et flag. `/nyheder` bruger den fælles `ProtectedRoute` fra
 * auth-domænet -- ikke en lokal kopi -- så der kun findes én regel for, hvad
 * "beskyttet" betyder (session *og* profil).
 *
 * `/proevemedlemskab` er offentlig: ansøgeren har ingen konto endnu.
 *
 * `/konto-slettet` står bevidst **ikke** her. Auth-domænet ejer den rute
 * (`features/auth/routes.tsx`), og to ruter med samme sti ville betyde, at den
 * først registrerede vandt -- et stille valg, ingen kunne se i koden.
 */
export const notificationRoutes: AppRoute[] = [
  {
    path: '/nyheder',
    element: (
      <ProtectedRoute>
        <NewsPage />
      </ProtectedRoute>
    ),
  },
  { path: '/proevemedlemskab', element: <ProbationApplicationPage /> },
]
