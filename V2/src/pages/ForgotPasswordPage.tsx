import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useStartPasswordRecovery } from '@convex-dev/auth/methods/email-password/react'
import { api } from '../../convex/_generated/api'
import { userErrorToAuthError } from '../features/auth/authErrors'

/**
 * Glemt adgangskode. Mailen indeholder et link til `/ny-adgangskode`.
 * En ukendt adresse får samme svar som en kendt, så siden ikke fortæller,
 * hvem der er oprettet.
 */
export default function ForgotPasswordPage() {
  const { startPasswordRecovery, pending } = useStartPasswordRecovery(api.auth)

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const result = await startPasswordRecovery({ email })
    if (result.success || result.userError.error === 'EMAIL_NOT_FOUND') {
      // Svar ens ved ukendt adresse, så siden ikke lækker medlemsliste.
      setSubmitted(true)
      return
    }
    setError(userErrorToAuthError(result.userError))
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Tjek din e-mail
        </h1>
        <p className="text-ink-muted">
          Hvis der findes en bruger med den e-mail, har vi sendt et link til at
          nulstille adgangskoden.
        </p>
        <Link to="/login" className="underline">
          Tilbage til login
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-ink-body">
        Glemt adgangskode
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          E-mail
          <input
            id="forgot-password-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            id="forgot-password-error"
            role="alert"
            className="text-sm text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
        >
          {pending ? 'Sender…' : 'Send nulstillingslink'}
        </button>
      </form>

      <Link to="/login" className="text-sm text-ink-muted underline">
        Tilbage til login
      </Link>
    </main>
  )
}
