import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useConvexAuth } from 'convex/react'
import { useCurrentProfile } from './useCurrentProfile'

/**
 * Kræver en indlogget bruger med en profil.
 *
 * Ruten lægger sig om den beskyttede side, ikke omvendt: i den gamle app
 * kontrollerede den kun, om der var en session, fordi RLS beskyttede data
 * alligevel. I V2 er profilen medlemskabet, så uden en `profiles`-række ville
 * siden bare møde `NOT_A_MEMBER` fra hver enkelt query.
 *
 * De tre tilstande holdes ude fra hinanden med `useConvexAuth` frem for at
 * gætte ud fra profilen, fordi `null` betyder både "ikke logget ind" og
 * "logget ind, men endnu ikke medlem":
 *
 * 1. ingen session -> login, med den sti man kom fra, så man lander tilbage.
 * 2. session uden profil -> velkomstsiden, som opretter profilen.
 * 3. profil -> siden.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const { profile, isLoading } = useCurrentProfile()
  const location = useLocation()

  if (authLoading || isLoading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (profile === null) {
    return <Navigate to="/velkommen" replace />
  }

  if (profile === undefined) return null

  return <>{children}</>
}
