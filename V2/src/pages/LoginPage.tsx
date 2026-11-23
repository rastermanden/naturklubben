import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction, useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  errorCode,
  toFriendlyAuthError,
  userErrorToAuthError,
} from '../features/auth/authErrors'
import { signInWithPreviewFallback } from '../features/auth/signInWithPreviewFallback'

/**
 * Login med e-mail og adgangskode via Convex Auth 2.x.
 *
 * `signInWithEmailPassword` / `signInWithPreviewMember` returnerer en
 * session-bundle, som vedtages via `setSession(tokens)`. Når `useConvexAuth`
 * viser `isAuthenticated: true`, sendes brugeren videre til `from`.
 */
export default function LoginPage() {
  const { setSession } = useAuthActions()
  const signInWithPassword = useMutation(api.auth.signInWithEmailPassword)
  const signInWithPreviewMember = useAction(api.auth.signInWithPreviewMember)
  const { isAuthenticated, isLoading } = useConvexAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCodeRaw, setErrorCodeRaw] = useState<string | null>(null)
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setErrorCodeRaw(null)
    setErrorField(null)
    setSubmitting(true)

    // Læs felterne fra formularen, ikke kun fra state. Autofyld og et
    // programmatisk felt kan have en værdi, React endnu ikke har committet.
    const data = new FormData(event.currentTarget)
    const submittedEmail = String(data.get('email') ?? '')
    const submittedPassword = String(data.get('password') ?? '')

    try {
      const { result } = await signInWithPreviewFallback({
        signInWithPassword,
        signInWithPreviewMember,
        setSession,
        email: submittedEmail,
        password: submittedPassword,
      })
      if (result.status !== 'complete') {
        const rawCode = result.userError.error
        const lower = rawCode.toLowerCase()
        const field =
          lower.includes('invalid') ||
          lower.includes('secret') ||
          lower.includes('credentials') ||
          lower.includes('password') ||
          lower.includes('not_found')
            ? 'password'
            : lower.includes('email')
              ? 'email'
              : null

        setError(userErrorToAuthError(result.userError))
        setErrorCodeRaw(rawCode)
        setErrorField(field)
        if (field === 'password') passwordRef.current?.focus()
        if (field === 'email') emailRef.current?.focus()
      }
    } catch (signInError) {
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
      setErrorCodeRaw(
        errorCode(signInError) ?? String(signInError).slice(0, 120),
      )
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
            name="email"
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
            name="password"
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
            data-code={errorCodeRaw ?? ''}
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
