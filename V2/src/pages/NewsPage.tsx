import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { Id } from '../../convex/_generated/dataModel'
import { FeatureNotificationPreference } from '../features/announcements/FeatureNotificationPreference'
import { useFeatureAnnouncements } from '../features/announcements/useFeatureAnnouncements'
import { NotificationToggle } from '../features/notifications/NotificationToggle'

const releasedFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Nyheder: hvad appen har fået af nye funktioner, nyeste først.
 *
 * Siden er både arkivet og det sted, man vælger, om nyhederne også skal komme
 * som en notifikation -- de to spørgsmål hører sammen, og valget skal kunne
 * findes af den, der lige har fået en notifikation, den ikke ville have.
 *
 * Ruten er beskyttet: nyhederne er for medlemmer, og `announcements.list`
 * kræver en profil.
 */
function NewsPage() {
  const { announcements, unread, isLoading, markAsRead } =
    useFeatureAnnouncements()

  // Har man læst listen, er nyhederne set -- men først når siden forlades.
  // Markerede vi dem med det samme, ville "Ny"-mærket forsvinde for øjnene af
  // den, der lige er kommet for at se, hvad der var nyt.
  const unreadKey = unread.map(({ id }) => id).join(',')
  const unreadOnPage = useRef<Id<'featureAnnouncements'>[]>([])
  const markAsReadRef = useRef(markAsRead)
  useEffect(() => {
    unreadOnPage.current = (
      unreadKey ? unreadKey.split(',') : []
    ) as Id<'featureAnnouncements'>[]
  }, [unreadKey])
  useEffect(() => {
    markAsReadRef.current = markAsRead
  }, [markAsRead])
  useEffect(
    () => () => {
      void markAsReadRef.current(unreadOnPage.current)
    },
    [],
  )

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-body">Nyheder</h1>
        <p className="text-ink-subtle">
          Nye funktioner i appen, nyeste først. Du kan få dem som en
          notifikation på telefonen.
        </p>
      </div>

      <section
        aria-label="Notifikationer om nye funktioner"
        className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4"
      >
        <NotificationToggle />
        <FeatureNotificationPreference />
      </section>

      {isLoading && (
        <p role="status" className="text-ink-muted">
          Henter nyheder…
        </p>
      )}

      {!isLoading && announcements.length === 0 && (
        <p className="text-ink-muted">
          Der er ingen nyheder endnu. Næste gang appen får noget nyt, står det
          her.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {announcements.map((announcement) => (
          <li
            key={announcement.id}
            className="rounded-xl border border-line-soft bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-medium text-ink">
                {announcement.title}
              </h2>
              {!announcement.isRead && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">
                  Ny
                </span>
              )}
            </div>
            <p className="text-sm text-ink-subtle">
              {releasedFormatter.format(new Date(announcement.releasedAt))}
            </p>
            <p className="mt-2 text-ink-body">{announcement.body}</p>
            {announcement.path && (
              <Link
                to={`/${announcement.path}`}
                className="mt-2 inline-block text-sm text-ink-muted underline"
              >
                Prøv den
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default NewsPage
