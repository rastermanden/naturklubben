import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { appUrl } from '../features/auth/authRedirect'
import { toFriendlyAuthError } from '../features/auth/authErrors'

function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // Uden denne lander bekræftelsesmailens link på projektets Site URL --
        // altså et andet sted end appen -- og brugeren ser en 404 i stedet for
        // en kvittering. Se src/features/auth/authRedirect.ts.
        emailRedirectTo: appUrl('velkommen'),
      },
    })

    setSubmitting(false)
    if (signUpError) {
      setError(toFriendlyAuthError(signUpError.message))
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Tjek din e-mail
        </h1>
        <p className="text-green-800">
          Vi har sendt en bekræftelsesmail til <strong>{email}</strong>. Klik på
          linket i mailen for at aktivere din bruger — så er du logget ind med
          det samme.
        </p>
        <p className="text-sm text-green-700">
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
      <h1 className="text-2xl font-semibold text-green-900">Opret bruger</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-green-900">
          Navn
          <input
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          E-mail
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Adgangskode
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {submitting ? 'Opretter…' : 'Opret bruger'}
        </button>
      </form>

      <span className="text-sm text-green-800">
        Har du allerede en bruger?{' '}
        <Link to="/login" className="underline">
          Log ind
        </Link>
      </span>
    </main>
  )
}

export default SignupPage
