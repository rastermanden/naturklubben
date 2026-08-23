import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  toFriendlyProbationApplicationError,
  useSubmitProbationApplication,
} from '../features/probation/useProbationApplications'
import {
  prepareBrowserPushSubscription,
  PushSetupError,
} from '../features/notifications/usePushNotifications'
import { useErrorFocus } from '../hooks/useErrorFocus'

const PUSH_ERROR_TEXT = {
  unsupported:
    'Din browser kan ikke modtage svaret som notifikation. Brug en browser med Web Push og prøv igen.',
  'needs-install':
    'På iPhone og iPad skal appen først lægges på hjemmeskærmen (Del → Føj til hjemmeskærm). Åbn den derfra og prøv igen.',
  blocked:
    'Notifikationer er blokeret for siden. Slå dem til i browserens indstillinger og prøv igen.',
} as const

function isApplicationFieldError(error: unknown) {
  if (error instanceof PushSetupError) return false
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  return ['invalid_request', '22001', '22023'].includes(String(error.code))
}

function ProbationApplicationPage() {
  const submitApplication = useSubmitProbationApplication()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [motivation, setMotivation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldsInvalid, setFieldsInvalid] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const fullNameRef = useRef<HTMLInputElement>(null)
  const focusFieldError = useErrorFocus(fullNameRef)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldsInvalid(false)

    try {
      const subscription = await prepareBrowserPushSubscription(
        'probation-notifications',
      )
      await submitApplication.mutateAsync({
        fullName,
        email,
        motivation,
        subscription,
      })
      setSubmitted(true)
      setFullName('')
      setEmail('')
      setMotivation('')
    } catch (submitError) {
      const fieldError = isApplicationFieldError(submitError)
      setError(
        submitError instanceof PushSetupError
          ? PUSH_ERROR_TEXT[submitError.reason]
          : toFriendlyProbationApplicationError(submitError),
      )
      setFieldsInvalid(fieldError)
      if (fieldError) focusFieldError()
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Ansøgning modtaget
        </h1>
        <p className="text-green-800">
          Tak for din interesse i Naturklubben. Vi gennemgår ansøgningen manuelt
          og sender svaret som en notifikation på denne enhed.
        </p>
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
            id="probation-full-name"
            ref={fullNameRef}
            type="text"
            required
            maxLength={200}
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-invalid={fieldsInvalid ? true : undefined}
            aria-describedby={
              fieldsInvalid ? 'probation-application-error' : undefined
            }
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          E-mail
          <input
            id="probation-email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldsInvalid ? true : undefined}
            aria-describedby={
              fieldsInvalid ? 'probation-application-error' : undefined
            }
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Hvorfor vil du være med?
          <textarea
            id="probation-motivation"
            required
            maxLength={5000}
            rows={5}
            value={motivation}
            onChange={(event) => setMotivation(event.target.value)}
            aria-invalid={fieldsInvalid ? true : undefined}
            aria-describedby={
              fieldsInvalid ? 'probation-application-error' : undefined
            }
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {error && (
          <p
            id="probation-application-error"
            role={fieldsInvalid ? undefined : 'alert'}
            className="text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitApplication.isPending}
          className="min-h-11 rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
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
