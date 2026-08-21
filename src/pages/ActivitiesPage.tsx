import type { ReactNode } from 'react'
import { useActivities } from '../features/activities/useActivities'

const iconPaths: Record<string, ReactNode> = {
  footprints: (
    <>
      <path d="M4 16.5c1.3-1.8 3.1-2.8 4.7-2.1 1.7.7 2.1 3 1.1 5.2-.8 1.8-2.8 2.8-4.4 2.1-1.7-.7-2.4-3.2-1.4-5.2Z" />
      <path d="M14.2 4.4c1-2.2 3.1-3.2 4.8-2.4 1.6.7 2.2 3.1 1.3 5.2-1 2.2-3.1 3.2-4.8 2.4-1.6-.7-2.2-3.1-1.3-5.2Z" />
      <path d="M12.5 11.5c1.3 1.1 2.2 2.5 2.7 4.3" />
      <path d="M11.5 9.5c-.5-.8-1.2-1.6-2-2.3" />
    </>
  ),
  binoculars: (
    <>
      <path d="m7 7-2 9" />
      <path d="m17 7 2 9" />
      <path d="M5 16h14" />
      <path d="M8 7h8l1 9H7L8 7Z" />
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="m9 7 1-3h4l1 3" />
    </>
  ),
  'trash-2': (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 15H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
}

function ActivityIcon({ name }: { name: string | null }) {
  const paths = name ? iconPaths[name] : undefined

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800">
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths ?? (
          <>
            <path d="M12 22V10" />
            <path d="M12 13C7 13 4 10 4 5c5 0 8 3 8 8Z" />
            <path d="M12 17c0-4 3-7 8-7 0 5-3 7-8 7Z" />
          </>
        )}
      </svg>
    </span>
  )
}

function ActivitiesPage() {
  const { data: activities, isPending, isError } = useActivities()

  return (
    <main className="bg-green-50/60 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-widest text-green-700 uppercase">
            Ud i det fri
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-green-950 sm:text-4xl">
            Det laver vi i Naturklubben
          </h1>
          <p className="mt-4 text-base leading-7 text-green-800 sm:text-lg">
            Vi mødes om gode oplevelser i naturen. Her kan du se de aktiviteter,
            vi samles om gennem året.
          </p>
        </header>

        <section className="mt-10" aria-live="polite" aria-busy={isPending}>
          {isPending && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-48 animate-pulse rounded-2xl border border-green-100 bg-white"
                />
              ))}
            </div>
          )}

          {isError && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-white p-8 text-center"
            >
              <h2 className="text-lg font-semibold text-red-900">
                Aktiviteterne kunne ikke hentes
              </h2>
              <p className="mt-2 text-red-800">
                Prøv at genindlæse siden om et øjeblik.
              </p>
            </div>
          )}

          {activities?.length === 0 && (
            <div className="rounded-2xl border border-green-200 bg-white p-8 text-center">
              <div className="flex justify-center">
                <ActivityIcon name={null} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-green-950">
                Ingen aktiviteter endnu
              </h2>
              <p className="mt-2 text-green-800">
                Nye naturoplevelser bliver vist her, så snart de er planlagt.
              </p>
            </div>
          )}

          {activities && activities.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm"
                >
                  <ActivityIcon name={activity.icon} />
                  <h2 className="mt-5 text-xl font-semibold text-green-950">
                    {activity.title}
                  </h2>
                  <p className="mt-3 leading-7 text-green-800">
                    {activity.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

export default ActivitiesPage
