import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  authCallbackParams,
  clearAuthCallbackParams,
} from '../features/auth/authCallbackUrl'
import {
  toFriendlyAuthError,
  toFriendlyLinkError,
} from '../features/auth/authErrors'
import { useAuth } from '../features/auth/useAuth'
import { useErrorFocus } from '../hooks/useErrorFocus'

/**
 * Landingssiden for linket i nulstillingsmailen (`/ny-adgangskode`).
 *
 * Linket logger brugeren ind med en midlertidig session, og herfra kan
 * adgangskoden skiftes. Uden denne side førte "Glemt adgangskode" til et link,
 * der ikke havde noget sted at lande.
 */
function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const { errorCode, errorDescription } = authCallbackParams

  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'password' | 'repeated' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const repeatedRef = useRef<HTMLInputElement>(null)
  const [focusPasswordError, passwordErrorAnnouncement] =
    useErrorFocus(passwordRef)
  const [focusRepeatedError, repeatedErrorAnnouncement] =
    useErrorFocus(repeatedRef)
  const errorAnnouncement =
    errorField === 'password'
      ? passwordErrorAnnouncement
      : errorField === 'repeated'
        ? repeatedErrorAnnouncement
        : 0

  useEffect(() => clearAuthCallbackParams(), [])

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

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setSubmitting(false)
    if (updateError) {
      setError(toFriendlyAuthError(updateError.message))
      if (updateError.message === 'Password should be at least 6 characters') {
        setErrorField('password')
        focusPasswordError()
      }
      return
    }
    // Sessionen fra mail-linket er en helt almindelig session, så brugeren er
    // logget ind bagefter og skal ikke først forbi login.
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">Et øjeblik…</h1>
      </main>
    )
  }

  if (errorCode || !session) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Linket virkede ikke
        </h1>
        <p className="text-green-800">
          {errorCode
            ? toFriendlyLinkError(errorCode, errorDescription)
            : 'Linket er udløbet eller allerede brugt.'}{' '}
          Bed om et nyt link, så sender vi en ny mail.
        </p>
        <Link
          to="/glemt-adgangskode"
          className="inline-flex min-h-11 items-center justify-center rounded bg-green-800 px-4 py-2 text-white"
        >
          Send et nyt link
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-green-900">
        Vælg en ny adgangskode
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-green-900">
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
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
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
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            key={errorAnnouncement}
            id="reset-password-error"
            role={
              errorField
                ? errorAnnouncement > 0
                  ? 'alert'
                  : undefined
                : 'alert'
            }
            className="text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {submitting ? 'Gemmer…' : 'Gem adgangskode'}
        </button>
      </form>
    </main>
  )
}

export default ResetPasswordPage
