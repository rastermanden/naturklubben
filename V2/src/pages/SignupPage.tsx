import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { errorCode, toFriendlyAuthError } from '../features/auth/authErrors'

/**
 * Opret bruger, og gør den til medlem.
 *
 * To trin, og rækkefølgen er vigtig:
 *
 * 1. `signIn('password', { flow: 'signUp' })` opretter auth-brugeren. Convex
 *    Auth har ingen bekræftelsesmail i denne opsætning, så sessionen findes
 *    med det samme -- der er intet "tjek din e-mail"-trin.
 * 2. `members.claimProfile` opretter `profiles`-rækken og afviser med
 *    `EMAIL_NOT_ALLOWED`, hvis adressen ikke står på allowlisten. Afvisningen
 *    kommer altså *efter* auth-brugeren er oprettet; derfor logges der ud igen,
 *    så ingen går rundt med en session uden medlemskab. Bliver adressen senere
 *    inviteret, kan personen logge ind med den adgangskode, der blev valgt her.
 */
export default function SignupPage() {
  const { signIn, signOut } = useAuthActions()
  const claimProfile = useMutation(api.members.claimProfile)
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setSubmitting(true)

    try {
      await signIn('password', {
        email,
        password,
        flow: 'signUp',
        name: fullName,
      })
    } catch (signUpError) {
      const raw = errorCode(signUpError)?.toLowerCase() ?? ''
      const field =
        raw.includes('already') ||
        raw.includes('exists') ||
        raw.includes('email')
          ? 'email'
          : raw.includes('password')
            ? 'password'
            : null

      setError(toFriendlyAuthError(signUpError))
      setErrorField(field)
      if (field === 'email') emailRef.current?.focus()
      if (field === 'password') passwordRef.current?.focus()
      setSubmitting(false)
      return
    }

    try {
      await claimProfile({})
      navigate('/velkommen', { replace: true })
    } catch (claimError) {
      await signOut()
      setError(
        `${toFriendlyAuthError(claimError)} Er du blevet inviteret senere, kan du logge ind med den adgangskode, du valgte her.`,
      )
      setErrorField('email')
      emailRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
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
    </main>
  )
}
