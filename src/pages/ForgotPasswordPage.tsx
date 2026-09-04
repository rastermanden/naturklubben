import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { appUrl } from '../features/auth/authRedirect'
import { toFriendlyAuthError } from '../features/auth/authErrors'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: appUrl('ny-adgangskode') },
    )

    setSubmitting(false)
    if (resetError) {
      setError(toFriendlyAuthError(resetError.message))
      return
    }
    setSubmitted(true)
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
          disabled={submitting}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
        >
          {submitting ? 'Sender…' : 'Send nulstillingslink'}
        </button>
      </form>

      <Link to="/login" className="text-sm text-ink-muted underline">
        Tilbage til login
      </Link>
    </main>
  )
}

export default ForgotPasswordPage
