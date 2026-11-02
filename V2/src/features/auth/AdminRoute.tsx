import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useCurrentProfile } from './useCurrentProfile'

/**
 * Kræver administrator. Ligger inden i en `ProtectedRoute`.
 *
 * Svaret kommer fra `profiles.isAdmin` -- ikke fra en rolle på auth-brugeren --
 * så det er den samme vurdering, backend'ens `requireAdmin` laver. Bliver man
 * nedgraderet, mens siden er åben, forsvinder den ved næste opdatering af
 * queryen, fordi Convex-abonnementet skubber ændringen ud.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { profile, isLoading } = useCurrentProfile()

  if (isLoading || profile === undefined) return null

  if (!profile?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
