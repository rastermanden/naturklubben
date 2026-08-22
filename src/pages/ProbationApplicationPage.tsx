import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  toFriendlyProbationApplicationError,
  useSubmitProbationApplication,
} from '../features/probation/useProbationApplications'

function ProbationApplicationPage() {
  const submitApplication = useSubmitProbationApplication()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [motivation, setMotivation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    try {
      await submitApplication.mutateAsync({ fullName, email, motivation })
      setSubmitted(true)
      setFullName('')
      setEmail('')
      setMotivation('')
    } catch (submitError) {
      setError(toFriendlyProbationApplicationError(submitError))
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-green-900">
          Ansøgning modtaget
        </h1>
        <p className="text-green-800">
          Tak for din interesse i Naturklubben. Vi gennemgår ansøgningen
          manuelt.
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
        </p>
      </div>

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
          Hvorfor vil du være med?
          <textarea
            required
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
          {submitApplication.isPending ? 'Sender…' : 'Send ansøgning'}
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
