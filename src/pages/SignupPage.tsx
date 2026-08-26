import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { appUrl } from '../features/auth/authRedirect'
import { toFriendlyAuthError } from '../features/auth/authErrors'
import { useErrorFocus } from '../hooks/useErrorFocus'

function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Hvad der faktisk skete -- ikke bare "der kom ingen fejl". Se handleSubmit.
  const [outcome, setOutcome] = useState<'confirm-email' | 'signed-in' | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(
    null,
  )
  const focusEmailError = useErrorFocus(emailRef)
  const focusPasswordError = useErrorFocus(passwordRef)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setSubmitting(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
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
      if (signUpError.message === 'Password should be at least 6 characters') {
        setErrorField('password')
        focusPasswordError()
      } else if (
        signUpError.message === 'User already registered' ||
        signUpError.message === 'Email not allowed'
      ) {
        setErrorField('email')
        focusEmailError()
      }
      return
    }

    // Supabase svarer uden fejl i tre forskellige situationer, og kun den ene
    // sender en mail. Kigger vi kun på `signUpError`, kommer appen til at
    // påstå, at der er sendt en bekræftelsesmail, i alle tre.

    // 1. Bekræftelse er slået fra på projektet (sådan er en Supabase Preview
    //    Branch typisk sat op): brugeren er logget ind med det samme, og der
    //    bliver aldrig sendt nogen mail.
    if (data?.session) {
      setOutcome('signed-in')
      return
    }

    // 2. Adressen er allerede oprettet. Med email-enumeration-beskyttelse slået
    //    til røber Supabase det ikke med en fejl -- kendetegnet er en tom
    //    identities-liste -- og der sendes ingen ny bekræftelsesmail.
    if (data?.user && data.user.identities?.length === 0) {
      setError(toFriendlyAuthError('User already registered'))
      setErrorField('email')
      focusEmailError()
      return
    }

    // 3. Alt normalt: brugeren er oprettet, og mailen er på vej.
    setOutcome('confirm-email')
  }

  if (outcome === 'signed-in') {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Du er oprettet
        </h1>
        <p className="text-green-800">
          Din bruger er klar, og du er logget ind med det samme -- der er ingen
          mail at bekræfte.
        </p>
        <Link
          to="/kalender"
          className="inline-flex min-h-11 items-center justify-center rounded bg-green-800 px-4 py-2 text-white"
        >
          Se kalenderen
        </Link>
        <Link to="/" className="text-sm text-green-800 underline">
          Gå til forsiden
        </Link>
      </main>
    )
  }

  if (outcome === 'confirm-email') {
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
            id="signup-full-name"
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
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
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
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            id="signup-error"
            role={errorField ? undefined : 'alert'}
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
          {submitting ? 'Opretter…' : 'Opret bruger'}
        </button>
      </form>

      <span className="text-sm text-green-800">
        Har du allerede en bruger?{' '}
        <Link to="/login" className="underline">
          Log ind
        </Link>
      </span>
      <span className="text-sm text-green-800">
        Ikke inviteret endnu?{' '}
        <Link to="/proevemedlemskab" className="underline">
          Ansøg om prøvemedlemskab
        </Link>
      </span>
    </main>
  )
}

export default SignupPage
