import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCompletePasswordRecovery } from '@convex-dev/auth/methods/email-password/react'
import { api } from '../../convex/_generated/api'
import { userErrorToAuthError } from '../features/auth/authErrors'
import { useErrorFocus } from '../hooks/useErrorFocus'

function RecoveryResetForm({ emailCode }: { emailCode: string }) {
  const navigate = useNavigate()
  const state = useCompletePasswordRecovery(api.auth, { emailCode })

  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'password' | 'repeated' | null>(
    null,
  )
  const passwordRef = useRef<HTMLInputElement>(null)
  const repeatedRef = useRef<HTMLInputElement>(null)
  const focusPasswordError = useErrorFocus(passwordRef)
  const focusRepeatedError = useErrorFocus(repeatedRef)

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">Et øjeblik…</h1>
      </main>
    )
  }

  if (state.status === 'complete') {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Adgangskoden er gemt
        </h1>
        <p className="text-ink-muted">Du er nu logget ind med din nye kode.</p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 text-white"
        >
          Gå til forsiden
        </Link>
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
            : 'Linket er udløbet eller allerede brugt. Bed om et nyt link, så sender vi en ny mail.'}
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (state.status !== 'ready') return
    if (password !== repeated) {
      setError('De to adgangskoder er ikke ens.')
      setErrorField('repeated')
      focusRepeatedError()
      return
    }
    setError(null)
    setErrorField(null)

    const result = await state.completePasswordRecovery({
      newPassword: password,
    })
    if (result.status === 'complete') {
      navigate('/', { replace: true })
      return
    }
    setError(userErrorToAuthError(result.userError))
    setErrorField('password')
    focusPasswordError()
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
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={state.pending}
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
            minLength={10}
            autoComplete="new-password"
            value={repeated}
            onChange={(event) => setRepeated(event.target.value)}
            disabled={state.pending}
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
          disabled={state.pending}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
        >
          {state.pending ? 'Gemmer…' : 'Gem adgangskode'}
        </button>
      </form>
    </main>
  )
}

/**
 * Landingssiden for linket i nulstillingsmailen (`/ny-adgangskode`).
 *
 * Indløser `?code=` sammen med browserens hemmelighed i én transaktion,
 * sætter den nye adgangskode og logger brugeren ind.
 */
export default function ResetPasswordPage() {
  const emailCode =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('code') ?? '')

  if (!emailCode) {
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

  return <RecoveryResetForm emailCode={emailCode} />
}
