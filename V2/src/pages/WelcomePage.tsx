import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { toFriendlyMemberError } from '../features/auth/authErrors'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'

/**
 * Landingssiden efter oprettelsen -- og redningen for en session uden profil.
 *
 * Convex Auth har ingen bekræftelsesmail i denne opsætning, så der er intet
 * link at vente på. Til gengæld kan `ProtectedRoute` sende folk hertil, når
 * der er en session men ingen `profiles`-række (fx fordi oprettelsen blev
 * afbrudt efter auth-brugeren blev lavet). Siden kalder derfor
 * `members.claimProfile`, som er idempotent, og viser svaret: velkommen --
 * eller forklaringen på, hvorfor adressen ikke er inviteret.
 *
 * Forsøget gøres kun én gang pr. sidevisning (`attempted`), så en afvist
 * adresse ikke hamrer løs mod backend'en i en uendelig løkke.
 */
export default function WelcomePage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const { profile, isLoading } = useCurrentProfile()
  const claimProfile = useMutation(api.members.claimProfile)
  const { signOut } = useAuthActions()

  const attempted = useRef(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || profile !== null || attempted.current) return

    attempted.current = true
    setClaiming(true)
    claimProfile({})
      .catch((claimError: unknown) => {
        setError(toFriendlyMemberError(claimError))
      })
      .finally(() => {
        setClaiming(false)
      })
  }, [claimProfile, isAuthenticated, profile])

  if (authLoading || isLoading || claiming) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Gør din bruger klar…
        </h1>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Du er ikke logget ind
        </h1>
        <p className="text-ink-muted">
          Log ind for at se, om din e-mail er inviteret til Naturklubben.
        </p>
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 text-white"
        >
          Log ind
        </Link>
      </main>
    )
  }

  if (error !== null) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Du er ikke medlem endnu
        </h1>
        <p className="text-ink-muted">{error}</p>
        <p className="text-sm text-ink-subtle">
          Bliver din adresse inviteret senere, kan du logge ind igen og komme
          videre herfra.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white"
        >
          Log ud
        </button>
      </main>
    )
  }

  const firstName = profile?.fullName?.trim().split(/\s+/)[0]

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-ink-body">
        {firstName ? `Velkommen, ${firstName}!` : 'Velkommen til Naturklubben!'}
      </h1>
      <p className="text-ink-muted">
        Din bruger er klar, og du er logget ind. Nu kan du se medlemmerne og
        tilpasse din profil -- resten af appen følger efter, efterhånden som
        den bliver portet.
      </p>
      <Link
        to="/medlemmer"
        className="inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 text-white"
      >
        Se medlemmerne
      </Link>
      <Link to="/profil" className="text-sm text-ink-muted underline">
        Tilpas din profil
      </Link>
      <Link to="/" className="text-sm text-ink-muted underline">
        Gå til forsiden
      </Link>
    </main>
  )
}
