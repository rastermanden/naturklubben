import { Link, useLocation } from 'react-router-dom'
import {
  useFeatureAnnouncements,
  useFeatureAnnouncementDelivery,
} from './useFeatureAnnouncements'

/**
 * "Nyt i appen" -- de nyheder, medlemmet ikke har set endnu.
 *
 * Banneret er den vej, der altid virker: notifikationer kræver, at medlemmet
 * har sagt ja (og på iPhone, at appen ligger på hjemmeskærmen), mens det her
 * står der, næste gang appen åbnes uanset hvad.
 *
 * Komponenten er samtidig det sted, der beder serveren om at sende
 * notifikationen -- se useFeatureAnnouncementDelivery. Den er monteret i
 * Layout, så det sker uanset hvilken side medlemmet åbner.
 */
export function FeatureAnnouncementBanner({ userId }: { userId: string }) {
  const { announcements, unread, isLoading, isError, markAsRead } =
    useFeatureAnnouncements(userId)
  useFeatureAnnouncementDelivery(announcements)
  const { pathname } = useLocation()

  if (isLoading || isError || unread.length === 0) return null
  // På Nyheder-siden ville banneret sige det samme som siden selv.
  if (pathname === '/nyheder') return null

  return (
    <aside
      aria-labelledby="feature-announcement-heading"
      className="mx-4 mt-4 shrink-0 rounded-xl border border-line bg-surface-sunken p-4"
    >
      <h2
        id="feature-announcement-heading"
        className="text-sm font-semibold tracking-wide text-ink-body uppercase"
      >
        {unread.length === 1 ? 'Nyt i appen' : `Nyt i appen (${unread.length})`}
      </h2>
      <ul className="mt-2 space-y-3">
        {unread.map((announcement) => (
          <li key={announcement.id}>
            <h3 className="font-medium text-ink">{announcement.title}</h3>
            <p className="text-sm text-ink-body">{announcement.body}</p>
            {announcement.path && (
              <Link
                to={`/${announcement.path}`}
                className="text-sm text-ink-muted underline"
              >
                Prøv den
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void markAsRead(unread.map(({ id }) => id))}
          className="min-h-11 rounded-full border border-accent bg-accent px-4 py-2 text-sm text-white"
        >
          Fik den
        </button>
        <Link to="/nyheder" className="text-sm text-ink-muted underline">
          Se alle nyheder
        </Link>
      </div>
    </aside>
  )
}
