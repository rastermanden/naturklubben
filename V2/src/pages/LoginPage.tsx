import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'
import { errorCode, toFriendlyAuthError } from '../features/auth/authErrors'

/**
 * Login med e-mail og adgangskode via Convex Auth.
 *
 * Convex Auth's `signIn('password', …)` sætter sessionen i samme kald, så der
 * er ingen session at vente på bagefter: er man logget ind, tegner
 * `useConvexAuth` det, og siden sender videre til den sti, man kom fra.
 */
export default function LoginPage() {
  const { signIn } = useAuthActions()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  if (isLoading) return null

  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setSubmitting(true)

    try {
      await signIn('password', { email, password, flow: 'signIn' })
    } catch (signInError) {
      // Convex Auth's tekst er engelsk og ikke en kontrakt, så feltet vælges
      // ud fra, hvad fejlen handler om -- ikke ud fra en fast streng.
      const raw = errorCode(signInError)?.toLowerCase() ?? ''
      const field =
        raw.includes('invalid') ||
        raw.includes('secret') ||
        raw.includes('credentials')
          ? 'password'
          : raw.includes('email') || raw.includes('exists')
            ? 'email'
            : null

      setError(toFriendlyAuthError(signInError))
      setErrorField(field)
      if (field === 'password') passwordRef.current?.focus()
      if (field === 'email') emailRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-ink-body">Log ind</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          E-mail
          <input
            id="login-email"
            ref={emailRef}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errorField ? true : undefined}
            aria-describedby={errorField ? 'login-error' : undefined}
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Adgangskode
          <input
            id="login-password"
            ref={passwordRef}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errorField === 'password' ? true : undefined}
            aria-describedby={
              errorField === 'password' ? 'login-error' : undefined
            }
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            id="login-error"
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
          {submitting ? 'Logger ind…' : 'Log ind'}
        </button>
      </form>

      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <Link to="/glemt-adgangskode" className="underline">
          Glemt adgangskode?
        </Link>
        <span>
          Ny i klubben?{' '}
          <Link to="/opret" className="underline">
            Opret bruger
          </Link>
        </span>
      </div>
    </main>
  )
}
