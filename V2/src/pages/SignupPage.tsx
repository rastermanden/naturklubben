import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  toFriendlyAuthError,
  userErrorToAuthError,
} from '../features/auth/authErrors'
import { useErrorFocus } from '../hooks/useErrorFocus'

const SIGNUP_SECRET_STORAGE_KEY = '__convexAuthEmailPasswordSignUpSecret'

/**
 * Opret bruger via `@convex-dev/auth` 2.x.
 *
 * Sender en bekræftelsesmail med link til `/velkommen`. Hemmeligheden gemmes
 * i browserens lager, så brugeren logges ind, når linket åbnes i samme browser.
 */
export default function SignupPage() {
  const runSignUp = useMutation(api.auth.signUpWithEmailPassword)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'confirm-email' | null>(null)
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const focusEmailError = useErrorFocus(emailRef)
  const focusPasswordError = useErrorFocus(passwordRef)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setSubmitting(true)

    try {
      const result = await runSignUp({ email, password, fullName })
      if (!result.success) {
        const raw = result.userError.error.toLowerCase()
        const field = raw.includes('password') ? 'password' : 'email'
        setError(userErrorToAuthError(result.userError))
        setErrorField(field)
        if (field === 'email') focusEmailError()
        if (field === 'password') focusPasswordError()
        return
      }
      try {
        window.localStorage.setItem(
          SIGNUP_SECRET_STORAGE_KEY,
          result.browserSecret,
        )
      } catch {
        // Ignorer evt. blokeret localStorage; landingssiden forklarer det.
      }
      setOutcome('confirm-email')
    } catch (signUpError) {
      setError(toFriendlyAuthError(signUpError))
      setErrorField('email')
      focusEmailError()
    } finally {
      setSubmitting(false)
    }
  }

  if (outcome === 'confirm-email') {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Tjek din e-mail
        </h1>
        <p className="text-ink-muted">
          Vi har sendt en bekræftelsesmail til <strong>{email}</strong>. Klik på
          linket i mailen for at aktivere din bruger — så er du logget ind med
          det samme.
        </p>
        <p className="text-sm text-ink-subtle">
          Kan du ikke finde mailen, så kig i spam-mappen.
        </p>
        <Link to="/login" className="underline">
          Tilbage til login
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-ink-body">Opret bruger</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Navn
          <input
            id="signup-full-name"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          E-mail
          <input
            id="signup-email"
            ref={emailRef}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errorField === 'email' ? true : undefined}
            aria-describedby={
              errorField === 'email' ? 'signup-error' : undefined
            }
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Adgangskode
          <input
            id="signup-password"
            ref={passwordRef}
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errorField === 'password' ? true : undefined}
            aria-describedby={
              errorField === 'password' ? 'signup-error' : undefined
            }
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            id="signup-error"
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
          {submitting ? 'Opretter…' : 'Opret bruger'}
        </button>
      </form>

      <span className="text-sm text-ink-muted">
        Har du allerede en bruger?{' '}
        <Link to="/login" className="underline">
          Log ind
        </Link>
      </span>
      <span className="text-sm text-ink-muted">
        Ikke inviteret endnu?{' '}
        <Link to="/proevemedlemskab" className="underline">
          Ansøg om prøvemedlemskab
        </Link>
      </span>
    </main>
  )
}
