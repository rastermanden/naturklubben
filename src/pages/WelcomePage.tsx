import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  authCallbackParams,
  clearAuthCallbackParams,
} from '../features/auth/authCallbackUrl'
import { toFriendlyLinkError } from '../features/auth/authErrors'
import { useAuth } from '../features/auth/useAuth'

/**
 * Landingssiden for linket i bekræftelsesmailen (`/velkommen`).
 *
 * Supabase sender brugeren hertil med sessionen i URL'ens fragment;
 * Supabase-klienten samler den selv op (`detectSessionInUrl`), så siden her
 * skal bare vente på, at `useAuth()` har en session -- eller fortælle
 * ordentligt, hvad der gik galt, hvis linket var udløbet.
 */
function WelcomePage() {
  const { session, loading } = useAuth()
  const { hasCredentials, errorCode, errorDescription } = authCallbackParams

  // Tokens/fejlkoder skal ikke blive hængende i adresselinjen: de er
  // engangsværdier, og et refresh med en brugt fejlkode ville bare vise den
  // samme fejl igen.
  useEffect(() => clearAuthCallbackParams(), [])

  if (errorCode) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Linket virkede ikke
        </h1>
        <p className="text-green-800">
          {toFriendlyLinkError(errorCode, errorDescription)} Opret dig igen med
          samme e-mail, så sender vi en ny bekræftelsesmail.
        </p>
        <Link
          to="/opret"
          className="inline-flex min-h-11 items-center justify-center rounded bg-green-800 px-4 py-2 text-white"
        >
          Prøv igen
        </Link>
        <Link to="/login" className="text-sm text-green-800 underline">
          Jeg har allerede en bruger
        </Link>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Bekræfter din e-mail…
        </h1>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          {hasCredentials ? 'Næsten i mål' : 'Bekræft din e-mail'}
        </h1>
        <p className="text-green-800">
          {hasCredentials
            ? 'Din e-mail er bekræftet, men vi kunne ikke logge dig ind automatisk. Log ind med din adgangskode nedenfor.'
            : 'Åbn linket i den mail, vi har sendt dig — eller log ind, hvis du allerede har bekræftet din e-mail.'}
        </p>
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center justify-center rounded bg-green-800 px-4 py-2 text-white"
        >
          Log ind
        </Link>
      </main>
    )
  }

  const name = (session.user.user_metadata?.full_name as string | undefined)
    ?.trim()
    .split(' ')[0]

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-green-900">
        {name ? `Velkommen, ${name}!` : 'Velkommen til Naturklubben!'}
      </h1>
      <p className="text-green-800">
        Din e-mail er bekræftet, og du er logget ind. Nu kan du se kalenderen,
        billederne og skrive med i chatten.
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

export default WelcomePage
