import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useCompleteSignUpWithEmailPassword } from '@convex-dev/auth/methods/email-password/react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  toFriendlyMemberError,
  userErrorToAuthError,
} from '../features/auth/authErrors'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'

function VerifySignupLink({
  emailCode,
  onVerified,
}: {
  emailCode: string
  onVerified: () => void
}) {
  const state = useCompleteSignUpWithEmailPassword(api.auth, { emailCode })

  useEffect(() => {
    if (state.status === 'complete') {
      onVerified()
    }
  }, [onVerified, state.status])

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">Et øjeblik…</h1>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Linket virkede ikke
        </h1>
        <p className="text-ink-muted">
          {state.userError.error === 'MISSING_SECRET'
            ? userErrorToAuthError(state.userError)
            : 'Bekræftelseslinket er udløbet eller allerede brugt.'}
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

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-ink-body">Et øjeblik…</h1>
    </main>
  )
}

/**
 * Landingssiden for linket i bekræftelsesmailen (`/velkommen`).
 *
 * Indløser `?code=` sammen med browserens hemmelighed via
 * `useCompleteSignUpWithEmailPassword`, og kalder derefter `members.claimProfile`.
 */
export default function WelcomePage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const { profile, isLoading } = useCurrentProfile()
  const claimProfile = useMutation(api.members.claimProfile)
  const { signOut } = useAuthActions()

  const attempted = useRef(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifiedNow, setVerifiedNow] = useState(false)

  const emailCode =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('code') ?? '')

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

  if (emailCode && !isAuthenticated && !verifiedNow) {
    return (
      <VerifySignupLink
        emailCode={emailCode}
        onVerified={() => setVerifiedNow(true)}
      />
    )
  }

  if (claiming || authLoading || (isAuthenticated && isLoading)) {
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
