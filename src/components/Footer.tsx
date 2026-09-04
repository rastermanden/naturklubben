import { Link } from 'react-router-dom'
import { appBuildDate, appVersion, formatAppVersion } from '../lib/appVersion'

export function Footer() {
  return (
    <footer className="shrink-0 border-t border-green-100 px-4 py-6 text-center text-sm text-green-700">
      <p>© {new Date().getFullYear()} Naturklubben</p>
      <Link to="/datapolitik" className="mt-1 inline-block underline">
        Politik for dataopbevaring
      </Link>
      {/* Så et medlem kan læse op, hvilket build de sidder med, når noget
          driller -- appen er en PWA og kan køre på en cachet, ældre version. */}
      <p className="mt-3 text-xs text-green-600">
        Version{' '}
        <span translate="no">{formatAppVersion(appVersion, appBuildDate)}</span>
      </p>
    </footer>
  )
}
