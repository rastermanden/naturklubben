import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { toFriendlyAuthError } from '../features/auth/authErrors'

/**
 * Nulstilling af adgangskode med engangskoden fra mailen.
 *
 * Andet trin af Convex Auth's `reset`-flow: koden og den nye adgangskode
 * sendes samlet med `flow: 'reset-verification'`. Kaldet logger folk ind, når
 * det lykkes, så der er ingen tur forbi login bagefter.
 *
 * Adressen forudfyldes fra `?email=`, som "glemt adgangskode" sender med. Den
 * står i URL'en og ikke i en tilstand, fordi et genindlæst link -- eller et
 * link åbnet i en anden fane -- ellers ville miste den.
 *
 * Kræver samme opsætning som `ForgotPasswordPage`: en e-mailudbyder i
 * `convex/auth.ts`. Uden den kan der ikke sendes en kode, og siden kan ikke
 * bruges i praksis endnu. Se rapporten.
 */
export default function ResetPasswordPage() {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<
    'code' | 'password' | 'repeated' | null
  >(null)
  const [submitting, setSubmitting] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const repeatedRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (password !== repeated) {
      setError('De to adgangskoder er ikke ens.')
      setErrorField('repeated')
      repeatedRef.current?.focus()
      return
    }

    setError(null)
    setErrorField(null)
    setSubmitting(true)

    try {
      await signIn('password', {
        email,
        code,
        newPassword: password,
        flow: 'reset-verification',
      })
      navigate('/', { replace: true })
    } catch (resetError) {
      setError(toFriendlyAuthError(resetError))
      setErrorField('code')
      codeRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-ink-body">
        Vælg en ny adgangskode
      </h1>
      <p className="text-sm text-ink-muted">
        Skriv koden fra mailen sammen med den adgangskode, du gerne vil have.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          E-mail
          <input
            id="reset-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Kode fra mailen
          <input
            id="reset-code"
            ref={codeRef}
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={errorField === 'code' ? true : undefined}
            aria-describedby={
              errorField === 'code' ? 'reset-password-error' : undefined
            }
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Ny adgangskode
          <input
            id="reset-password"
            ref={passwordRef}
            type="password"
            required
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

      <Link to="/glemt-adgangskode" className="text-sm text-ink-muted underline">
        Send en ny kode
      </Link>
    </main>
  )
}
