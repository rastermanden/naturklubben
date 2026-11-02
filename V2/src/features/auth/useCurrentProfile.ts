import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'

export type CurrentProfile = {
  /** `null` når der ikke er nogen session, eller når brugeren endnu ikke er medlem. */
  profile: Doc<'profiles'> | null | undefined
  isLoading: boolean
}

/**
 * Den indloggede brugers profil -- og dermed svaret på, om vedkommende er
 * medlem.
 *
 * Erstatter den gamle apps `useAuth().session` plus et separat opslag på
 * `profiles`: i V2 *er* profilen medlemskabet, fordi alt indhold kræver en
 * `requireProfile` i backend'en. `me` er den ene query, der må kaldes uden en
 * profil, så den kan svare "ingen session" med `null` i stedet for at kaste.
 *
 * Spørges der ikke (fordi der ikke er en session), springes kaldet over. Ellers
 * ville et login give et spildt kald, der kun kunne svare `null`.
 */
export function useCurrentProfile(): CurrentProfile {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const profile = useQuery(api.members.me, isAuthenticated ? {} : 'skip')

  return {
    profile: isAuthenticated ? profile : null,
    isLoading: authLoading || (isAuthenticated && profile === undefined),
  }
}
