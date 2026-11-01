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
export function restoreSpaRedirect(): void {
  const restored = restoredSpaPath(
    import.meta.env.BASE_URL,
    window.location.href,
  )
  if (restored === null) return
  window.history.replaceState(window.history.state, '', restored)
}
