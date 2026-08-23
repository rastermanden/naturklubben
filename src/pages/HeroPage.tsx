import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useActivities } from '../features/activities/useActivities'

function HeroPage() {
  const location = useLocation()
  const authRequired = (location.state as { authRequired?: boolean } | null)
    ?.authRequired
  const { session } = useAuth()
  const { data: activities } = useActivities(3)

  return (
    <main>
      <section className="flex min-h-[70svh] flex-col items-center justify-center gap-6 bg-green-50 p-6 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold text-green-900 sm:text-5xl">
            Naturklubben
          </h1>
          <p className="mx-auto max-w-prose text-lg text-green-800">
            Vi mødes om naturen — vandreture, fugletårne og fælles oprydninger.
            Log ind for at se kalender, billeder og chat med de andre medlemmer.
          </p>
        </div>

        {authRequired && (
          <p role="alert" className="max-w-prose text-sm text-amber-800">
            Du skal være logget ind for at se den side.
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {session ? (
            <Link
              to="/kalender"
              className="min-h-11 rounded bg-green-800 px-5 py-2 text-white flex items-center"
            >
              Gå til kalender
            </Link>
          ) : (
            <Link
              to="/login"
              className="min-h-11 rounded bg-green-800 px-5 py-2 text-white flex items-center"
            >
              Log ind
            </Link>
          )}
          {!session && (
            <Link
              to="/proevemedlemskab"
              className="min-h-11 flex items-center rounded border border-green-800 px-5 py-2 text-green-800"
            >
              Ansøg om prøvemedlemskab
            </Link>
          )}
          <Link
            to="/aktiviteter"
            className="min-h-11 flex items-center rounded border border-green-800 px-5 py-2 text-green-800"
          >
            Se aktiviteter
          </Link>
        </div>
      </section>

      {activities && activities.length > 0 && (
        <section className="mx-auto max-w-4xl p-6">
          <h2 className="mb-4 text-center text-xl font-semibold text-green-900">
            Det laver vi
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="rounded border border-green-100 p-4"
              >
                <h3 className="font-medium text-green-900">{activity.title}</h3>
                <p className="mt-1 text-sm text-green-800">
                  {activity.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link to="/aktiviteter" className="text-green-800 underline">
              Se alle aktiviteter
            </Link>
          </div>
        </section>
      )}
    </main>
  )
}

export default HeroPage
