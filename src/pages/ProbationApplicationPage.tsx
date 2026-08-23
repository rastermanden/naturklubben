import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  retryProbationNotification,
  toFriendlyProbationApplicationError,
  type SubmittedApplication,
  useSubmitProbationApplication,
} from '../features/probation/useProbationApplications'
import {
  prepareBrowserPushSubscription,
  PushSetupError,
} from '../features/notifications/usePushNotifications'

const PUSH_ERROR_TEXT = {
  unsupported:
    'Din browser kan ikke modtage svaret som notifikation. Brug en browser med Web Push og prøv igen.',
  'needs-install':
    'På iPhone og iPad skal appen først lægges på hjemmeskærmen (Del → Føj til hjemmeskærm). Åbn den derfra og prøv igen.',
  blocked:
    'Notifikationer er blokeret for siden. Slå dem til i browserens indstillinger og prøv igen.',
} as const

function ProbationApplicationPage() {
  const submitApplication = useSubmitProbationApplication()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [motivation, setMotivation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<SubmittedApplication | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    try {
      const subscription = await prepareBrowserPushSubscription(
        'probation-notifications',
      )
      const result = await submitApplication.mutateAsync({
        fullName,
        email,
        motivation,
        subscription,
      })
      setSubmitted(result)
      setFullName('')
      setEmail('')
      setMotivation('')
    } catch (submitError) {
      setError(
        submitError instanceof PushSetupError
          ? PUSH_ERROR_TEXT[submitError.reason]
          : toFriendlyProbationApplicationError(submitError),
      )
    }
  }

  async function retryAdminNotification() {
    if (!submitted) return
    setIsRetrying(true)
    try {
      const notification = await retryProbationNotification(
        submitted.applicationId,
        'admin',
        submitted.notificationToken,
      )
      setSubmitted({ ...submitted, notification })
    } catch (retryError) {
      console.error('Admin-notifikationen kunne ikke prøves igen', retryError)
      setSubmitted({
        ...submitted,
        notification: {
          status: 'failed',
          error: 'Notifikationen kunne ikke leveres. Prøv igen.',
        },
      })
    } finally {
      setIsRetrying(false)
    }
  }

  if (submitted) {
    const notificationFailed = submitted.notification.status === 'failed'
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Ansøgning modtaget
        </h1>
        <p className="text-green-800">
          Tak for din interesse i Naturklubben. Vi gennemgår ansøgningen manuelt
          og sender svaret som en notifikation på denne enhed.
        </p>
        {notificationFailed && (
          <div
            role="alert"
            className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4 text-amber-900"
          >
            <p>
              Ansøgningen er gemt, men administratorerne kunne ikke få
              notifikationen: {submitted.notification.error ?? 'Ukendt fejl'}
            </p>
            <button
              type="button"
              onClick={() => void retryAdminNotification()}
              disabled={isRetrying}
              className="rounded border border-amber-500 px-4 py-2 disabled:opacity-50"
            >
              {isRetrying ? 'Prøver igen…' : 'Prøv notifikationen igen'}
            </button>
          </div>
        )}
        <Link to="/" className="underline">
          Tilbage til forsiden
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-green-900">
          Ansøg om prøvemedlemskab
        </h1>
        <p className="text-green-800">
          Fortæl kort, hvem du er, og hvorfor du gerne vil være med i klubben.
          Når du sender, beder browseren om lov til at vise notifikationer, så
          du kan få svar på ansøgningen.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-green-900">
          Navn
          <input
            type="text"
            required
            maxLength={200}
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
            maxLength={320}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Hvorfor vil du være med?
          <textarea
            required
            maxLength={5000}
            rows={5}
            value={motivation}
            onChange={(event) => setMotivation(event.target.value)}
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
          disabled={submitApplication.isPending}
          className="rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {submitApplication.isPending
            ? 'Sender…'
            : 'Tillad notifikationer og send'}
        </button>
      </form>

      <div className="flex flex-col gap-1 text-sm text-green-800">
        <span>
          Har du allerede fået grønt lys?{' '}
          <Link to="/opret" className="underline">
            Opret bruger
          </Link>
        </span>
        <span>
          Har du allerede en bruger?{' '}
          <Link to="/login" className="underline">
            Log ind
          </Link>
        </span>
      </div>
    </main>
  )
}

export default ProbationApplicationPage
