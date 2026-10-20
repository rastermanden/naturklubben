import { Link, Outlet } from 'react-router-dom'
import { appBuildDate, appVersion, formatAppVersion } from '../lib/appVersion'

/**
 * Den ydre ramme: header, indhold, footer.
 *
 * Bevidst minimal indtil feature-domænerne lander. Den skal have samme
 * semantiske farveklasser som den gamle app (`bg-surface`, `text-ink-muted`),
 * så den mørke tilstand virker fra første dag.
 */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-app text-ink-body">
      <header className="border-b border-line bg-surface px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-ink">
          Naturklubben
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line-soft px-4 py-3 text-center text-sm text-ink-subtle">
        Version {formatAppVersion(appVersion, appBuildDate)}
      </footer>
    </div>
  )
}
