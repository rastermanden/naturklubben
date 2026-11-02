import { computeSpaFallback } from './spaFallback'

export { computeSpaFallback }

/**
 * Pakker `?spa-path=` ud til den rigtige adresse under appens base.
 * Bruges før React Router læser adressen.
 */
export function restoredSpaPath(base: string, href: string): string | null {
  const url = new URL(href)
  const path = url.searchParams.get('spa-path')
  if (path === null) return null
  url.searchParams.delete('spa-path')
  const restored = new URL(
    `${base}${path.replace(/^\/+/, '')}${url.search}`,
    url.origin,
  )
  restored.hash = url.hash
  return restored.pathname + restored.search + restored.hash
}

/**
 * Modstykket til den 404.html, `vite.config.ts` udgiver.
 *
 * GitHub Pages kan ikke servere en SPA'ens index.html for vilkårlige stier, så
 * 404-siden sender browseren videre til app'ens rod med den oprindelige sti i
 * `?spa-path=`. Her pakkes den ud igen og skrives tilbage i adresselinjen, før
 * React Router læser den.
 *
 * Query-strengen og fragmentet bevares som rigtige dele af URL'en (kun *stien*
 * pakkes ind): Convex Auth læser engangskoder og bekræftelseslinks fra netop
 * de dele, og det sker når auth-provideren mounter, altså efter denne funktion.
 */
/**
 * GitHub Pages sender `/kalender` videre til `/kalender/`, fordi kopien af
 * index.html ligger i mappen. React Router matcher ikke den ekstra skråstreg
 * som den samme rute, så den fjernes før routeren læser adressen.
 */
export function withoutTrailingRouteSlash(
  base: string,
  pathname: string,
): string | null {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  if (!pathname.startsWith(normalizedBase)) return null
  const rest = pathname.slice(normalizedBase.length)
  if (rest.length === 0 || !rest.endsWith('/')) return null
  return normalizedBase + rest.replace(/\/+$/, '')
}

export function restoreSpaRedirect(): void {
  const base = import.meta.env.BASE_URL
  const current = new URL(window.location.href)
  const restored = restoredSpaPath(base, current.href)
  if (restored !== null) {
    const restoredUrl = new URL(restored, current.origin)
    const stripped = withoutTrailingRouteSlash(base, restoredUrl.pathname)
    if (stripped !== null) restoredUrl.pathname = stripped
    window.history.replaceState(
      window.history.state,
      '',
      restoredUrl.pathname + restoredUrl.search + restoredUrl.hash,
    )
    return
  }
  const stripped = withoutTrailingRouteSlash(base, current.pathname)
  if (stripped === null) return
  window.history.replaceState(
    window.history.state,
    '',
    stripped + current.search + current.hash,
  )
}
