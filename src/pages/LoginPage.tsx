import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyAuthError } from '../features/auth/authErrors'
import { useErrorFocus } from '../hooks/useErrorFocus'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'email' | 'credentials' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const [focusEmailError, emailErrorAnnouncement] = useErrorFocus(emailRef)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setSubmitting(false)
    if (signInError) {
      setError(toFriendlyAuthError(signInError.message))
      if (signInError.message === 'Invalid login credentials') {
        setErrorField('credentials')
        focusEmailError()
      } else if (signInError.message === 'Email not confirmed') {
        setErrorField('email')
        focusEmailError()
      }
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-green-900">Log ind</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-green-900">
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
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Adgangskode
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errorField === 'credentials' ? true : undefined}
            aria-describedby={
              errorField === 'credentials' ? 'login-error' : undefined
            }
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            key={emailErrorAnnouncement}
            id="login-error"
            role={
              errorField
                ? emailErrorAnnouncement > 0
                  ? 'alert'
                  : undefined
                : 'alert'
            }
            className="text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {submitting ? 'Logger ind…' : 'Log ind'}
        </button>
      </form>

      <div className="flex flex-col gap-1 text-sm text-green-800">
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

export default LoginPage
