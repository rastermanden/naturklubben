import { Link } from 'react-router-dom'
import { ActivityIcon } from '../features/activities/ActivityIcon'
import { useActivities } from '../features/activities/useActivities'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'

function ClubLinkCard({
  to,
  title,
  description,
}: {
  to: string
  title: string
  description: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-11 items-center justify-between gap-4 rounded-2xl border border-line-soft bg-surface p-6 shadow-sm hover:bg-surface-sunken"
      >
        <span>
          <span className="block text-xl font-semibold text-ink">{title}</span>
          <span className="mt-1 block text-ink-muted">{description}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-2xl text-ink-subtle">
          →
        </span>
      </Link>
    </li>
  )
}

/**
 * Den offentlige aktivitetsside. Indholdet er klubbens eget, så den kræver
 * hverken login eller medlemskab -- samme regel som i den gamle app.
 */
function ActivitiesPage() {
  const activitiesQuery = useActivities()
  const activities = activitiesQuery ?? []
  const { profile } = useCurrentProfile()

  return (
    <main className="bg-surface-sunken/60 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-widest text-ink-subtle uppercase">
            Ud i det fri
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">
            Det laver vi i Naturklubben
          </h1>
          <p className="mt-4 text-base leading-7 text-ink-muted sm:text-lg">
            Vi mødes om gode oplevelser i naturen. Her kan du se de aktiviteter,
            vi samles om gennem året.
          </p>
        </header>

        <ul
          aria-label="Klubbens egne"
          className="mx-auto mt-10 flex max-w-2xl flex-col gap-4"
        >
          <ClubLinkCard
            to="/aktiviteter/btg-turnering"
            title="BTG turnering"
            description="Hold styr på kampe, resultater og stilling til klubbens bøssetennisgolf-turneringer."
          />
          {profile && (
            <ClubLinkCard
              to="/naturlog"
              title="Naturlog"
              description="Hvad har vi set derude? Skriv arten, stedet og datoen."
            />
          )}
        </ul>

        <section
          className="mt-10"
          aria-live="polite"
          aria-busy={activitiesQuery === undefined}
        >
          {activitiesQuery === undefined && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-48 animate-pulse rounded-2xl border border-line-soft bg-surface"
                />
              ))}
            </div>
          )}

          {activitiesQuery !== undefined && activities.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-8 text-center">
              <div className="flex justify-center">
                <ActivityIcon name={null} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-ink">
                Ingen aktiviteter endnu
              </h2>
              <p className="mt-2 text-ink-muted">
                Nye naturoplevelser bliver vist her, så snart de er planlagt.
              </p>
            </div>
          )}

          {activities.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="rounded-2xl border border-line-soft bg-surface p-6 shadow-sm"
                >
                  <ActivityIcon name={activity.icon} />
                  <h2 className="mt-5 text-xl font-semibold text-ink">
                    {activity.title}
                  </h2>
                  <p className="mt-3 leading-7 text-ink-muted">
                    {activity.description}
                  </p>
                  {activity.linkUrl !== null && activity.linkLabel !== null && (
                    <a
                      href={activity.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex min-h-11 items-center gap-1 font-medium text-ink-muted underline underline-offset-4"
                    >
                      {activity.linkLabel}
                      <span aria-hidden="true">&#8599;</span>
                      <span className="sr-only">(&aring;bner i ny fane)</span>
                    </a>
                  )}
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
