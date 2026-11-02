import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { clearAuthCodeWait, noteAuthCode } from '../features/auth/authCodeWait'
import { toFriendlyMemberError } from '../features/auth/authErrors'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'

/**
 * Landingssiden for linket i bekræftelsesmailen (`/velkommen`).
 *
 * Convex Auth samler `?code=` op og logger ind. Siden venter på sessionen
 * og kalder derefter `members.claimProfile`, som er idempotent. En session
 * uden profil (oprettelsen blev afbrudt) lander også her.
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
  const [gaveUp, setGaveUp] = useState(false)
  const waitingForCode = noteAuthCode(
    typeof window === 'undefined' ? '' : window.location.search,
  )

  useEffect(() => {
    if (!waitingForCode || isAuthenticated) {
      if (isAuthenticated) clearAuthCodeWait()
      return
    }
    const timeout = window.setTimeout(() => setGaveUp(true), 20000)
    return () => window.clearTimeout(timeout)
  }, [isAuthenticated, waitingForCode])

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

  if (
    (waitingForCode && !gaveUp && !isAuthenticated) ||
    authLoading ||
    isLoading ||
    claiming
  ) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">Et øjeblik…</h1>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Bekræft din e-mail
        </h1>
        <p className="text-ink-muted">
          Åbn linket i den mail, vi har sendt dig — eller log ind, hvis du
          allerede har bekræftet din e-mail.
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
        Din e-mail er bekræftet, og du er logget ind. Nu kan du se kalenderen,
        billederne og skrive med i chatten.
      </p>
      <Link
        to="/kalender"
        className="inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 text-white"
      >
        Se kalenderen
      </Link>
      <Link to="/" className="text-sm text-ink-muted underline">
        Gå til forsiden
      </Link>
    </main>
  )
}
