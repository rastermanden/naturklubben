import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { toFriendlyAuthError } from '../features/auth/authErrors'

/**
 * Glemt adgangskode.
 *
 * Convex Auth's nulstillingsflow er et engangskode-flow, ikke et link:
 * `signIn('password', { flow: 'reset' })` får backend'en til at sende en kode
 * til adressen, og koden tastes ind på `/ny-adgangskode` sammen med den nye
 * adgangskode.
 *
 * VIGTIGT -- opsætning mangler: `convex/auth.ts` bruger `Password` uden en
 * `sendVerificationRequest`, og der er ikke konfigureret nogen e-mailudbyder
 * på Convex-deploymentet. Derfor vil kaldet her fejle i praksis, og siden
 * viser fejlen i stedet for at påstå, at der er sendt en mail. Se rapporten.
 */
export default function ForgotPasswordPage() {
  const { signIn } = useAuthActions()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signIn('password', { email, flow: 'reset' })
      setSubmitted(true)
    } catch (resetError) {
      setError(toFriendlyAuthError(resetError))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-body">
          Tjek din e-mail
        </h1>
        <p className="text-ink-muted">
          Hvis der findes en bruger med den e-mail, har vi sendt en kode til at
          nulstille adgangskoden. Skriv koden og din nye adgangskode på næste
          side.
        </p>
        <Link
          to={`/ny-adgangskode?email=${encodeURIComponent(email)}`}
          className="inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 text-white"
        >
          Skriv koden
        </Link>
        <Link to="/login" className="text-sm text-ink-muted underline">
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
          disabled={submitting}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
        >
          {submitting ? 'Sender…' : 'Send nulstillingskode'}
        </button>
      </form>

      <Link to="/login" className="text-sm text-ink-muted underline">
        Tilbage til login
      </Link>
    </main>
  )
}
