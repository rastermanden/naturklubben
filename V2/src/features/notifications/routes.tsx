import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useConvexAuth } from '@convex-dev/auth/react'
import type { AppRoute } from '../../routes'
import AccountDeletedPage from '../../pages/AccountDeletedPage'
import NewsPage from '../../pages/NewsPage'
import ProbationApplicationPage from '../../pages/ProbationApplicationPage'

/**
 * Ruterne for notifikationer, nyheder, prøvemedlemskab og konto.
 *
 * `AppRoute` har kun en sti og et element, så beskyttelsen er en indpakning om
 * elementet og ikke et flag. `/nyheder` er beskyttet: den kræver en
 * login-session, og funktionerne bagved kræver desuden en profil
 * (`requireProfile`), så en konto uden profil heller ikke får data.
 *
 * `/proevemedlemskab` og `/konto-slettet` er offentlige -- ansøgeren har ingen
 * konto endnu, og medlemmet er logget ud, når kvitteringen vises.
 */
function RequireProfile({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

export const notificationRoutes: AppRoute[] = [
  {
    path: '/nyheder',
    element: (
      <RequireProfile>
        <NewsPage />
      </RequireProfile>
    ),
  },
  { path: '/proevemedlemskab', element: <ProbationApplicationPage /> },
  { path: '/konto-slettet', element: <AccountDeletedPage /> },
]
