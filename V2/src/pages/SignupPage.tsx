import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { appUrl } from '../features/auth/authRedirect'
import { errorCode, toFriendlyAuthError } from '../features/auth/authErrors'
import { useErrorFocus } from '../hooks/useErrorFocus'

/**
 * Opret bruger. Med bekræftelse slået til sender Convex Auth en mail med
 * link til `/velkommen`, og der er ingen session, før linket er åbnet.
 * Velkomstsiden opretter medlemskabet, når sessionen er der.
 */
export default function SignupPage() {
  const { signIn, signOut } = useAuthActions()
  const claimProfile = useMutation(api.members.claimProfile)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'confirm-email' | 'signed-in' | null>(
    null,
  )
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

    let signingIn = false
    try {
      const result = await signIn('password', {
        email,
        password,
        flow: 'signUp',
        name: fullName,
        redirectTo: appUrl('velkommen'),
      })
      signingIn = result.signingIn
    } catch (signUpError) {
      const raw = errorCode(signUpError)?.toLowerCase() ?? ''
      const field =
        raw.includes('at least 6') || raw.includes('password')
          ? 'password'
          : 'email'
      setError(toFriendlyAuthError(signUpError))
      setErrorField(field)
      if (field === 'email') focusEmailError()
      if (field === 'password') focusPasswordError()
      setSubmitting(false)
      return
    }

    if (!signingIn) {
      setOutcome('confirm-email')
      setSubmitting(false)
      return
    }

    try {
      await claimProfile({})
      setOutcome('signed-in')
    } catch (claimError) {
      await signOut()
      setError(
        `${toFriendlyAuthError(claimError)} Er du blevet inviteret senere, kan du logge ind med den adgangskode, du valgte her.`,
      )
      setErrorField('email')
      focusEmailError()
    } finally {
      setSubmitting(false)
    }
  }

  if (outcome === 'signed-in') {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">Du er oprettet</h1>
        <p className="text-ink-muted">
          Din bruger er klar, og du er logget ind med det samme -- der er ingen
          mail at bekræfte.
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
            minLength={6}
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
