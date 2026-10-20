import { Outlet } from 'react-router-dom'
import { appBuildDate, appVersion, formatAppVersion } from '../lib/appVersion'
import { Navbar } from './Navbar'

/**
 * Den ydre ramme: header, indhold, footer.
 *
 * Headeren er `Navbar` fra auth-slicen, så menuen, burger-skuffen og "log
 * ind/ud" er de samme på alle sider. Farverne er de semantiske
 * (`bg-surface`, `text-ink-muted`), så den mørke tilstand virker fra første
 * dag.
 */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-app text-ink-body">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line-soft px-4 py-3 text-center text-sm text-ink-subtle">
        Version {formatAppVersion(appVersion, appBuildDate)}
      </footer>
    </div>
  )
}
