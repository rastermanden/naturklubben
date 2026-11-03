import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAction } from 'convex/react'
import { useConvexAuth } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { toFriendlyAuthError } from '../features/auth/authErrors'
import { useErrorFocus } from '../hooks/useErrorFocus'

/**
 * Landingssiden for linket i nulstillingsmailen (`/ny-adgangskode`).
 *
 * Linket logger brugeren ind (koden i adressen samles op af Convex Auth),
 * og herfra vælges den nye adgangskode. Uden session er linket udløbet
 * eller allerede brugt.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const changePassword = useAction(api.passwords.changePassword)

  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'password' | 'repeated' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const repeatedRef = useRef<HTMLInputElement>(null)
  const focusPasswordError = useErrorFocus(passwordRef)
  const focusRepeatedError = useErrorFocus(repeatedRef)
  const [gaveUp, setGaveUp] = useState(false)

  // Auth-provideren kan blive stående i isLoading, hvis kode-indløsningen
  // kaster, eller hvis backend'en aldrig bekræfter sessionen. Så viser vi
  // den samme besked som et udløbet link i stedet for at hænge.
  useEffect(() => {
    if (!isLoading || isAuthenticated) return
    const timeout = window.setTimeout(() => setGaveUp(true), 12000)
    return () => window.clearTimeout(timeout)
  }, [isAuthenticated, isLoading])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password !== repeated) {
      setError('De to adgangskoder er ikke ens.')
      setErrorField('repeated')
      focusRepeatedError()
      return
    }
    setError(null)
    setErrorField(null)
    setSubmitting(true)

    try {
      await changePassword({ password })
      navigate('/', { replace: true })
    } catch (updateError) {
      setError(toFriendlyAuthError(updateError))
      const raw = toFriendlyAuthError(updateError)
      if (raw.includes('6 tegn')) {
        setErrorField('password')
        focusPasswordError()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading && !gaveUp) {
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
          Linket virkede ikke
        </h1>
        <p className="text-ink-muted">
          Linket er udløbet eller allerede brugt. Bed om et nyt link, så sender
          vi en ny mail.
        </p>
        <Link
          to="/glemt-adgangskode"
          className="inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 text-white"
        >
          Send et nyt link
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-ink-body">
        Vælg en ny adgangskode
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Ny adgangskode
          <input
            id="reset-password"
            ref={passwordRef}
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errorField === 'password' ? true : undefined}
            aria-describedby={
              errorField === 'password' ? 'reset-password-error' : undefined
            }
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Gentag adgangskoden
          <input
            id="reset-password-repeated"
            ref={repeatedRef}
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={repeated}
            onChange={(event) => setRepeated(event.target.value)}
            aria-invalid={errorField === 'repeated' ? true : undefined}
            aria-describedby={
              errorField === 'repeated' ? 'reset-password-error' : undefined
            }
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            id="reset-password-error"
            role={errorField ? undefined : 'alert'}
            className="text-sm text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
        >
          {submitting ? 'Gemmer…' : 'Gem adgangskode'}
        </button>
      </form>
    </main>
  )
}
