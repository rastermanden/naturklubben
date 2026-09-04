import { Link } from 'react-router-dom'
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { appBuildDate, appVersion, formatAppVersion } from '../lib/appVersion'

export function Footer() {
  return (
    <footer className="shrink-0 border-t border-line-soft px-4 py-6 text-center text-sm text-ink-subtle">
      <ThemeToggle className="mx-auto mb-5 max-w-xs" />
      <p>© {new Date().getFullYear()} Naturklubben</p>
      <Link to="/datapolitik" className="mt-1 inline-block underline">
        Politik for dataopbevaring
      </Link>
      {/* Så et medlem kan læse op, hvilket build de sidder med, når noget
          driller -- appen er en PWA og kan køre på en cachet, ældre version. */}
      <p className="mt-3 text-xs text-ink-subtle">
        Version{' '}
        <span translate="no">{formatAppVersion(appVersion, appBuildDate)}</span>
      </p>
    </footer>
  )
}
