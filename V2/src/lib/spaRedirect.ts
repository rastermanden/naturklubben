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
  const url = new URL(window.location.href)
  const path = url.searchParams.get('spa-path')
  if (path === null) return

  url.searchParams.delete('spa-path')
  const restored = new URL(
    `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}${url.search}`,
    window.location.origin,
  )
  restored.hash = url.hash

  window.history.replaceState(window.history.state, '', restored.href)
}
