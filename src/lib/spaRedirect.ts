/**
 * Modstykket til den 404.html, `vite.config.ts` udgiver.
 *
 * GitHub Pages kan ikke servere en SPA'ens index.html for vilkårlige stier, så
 * 404-siden sender browseren videre til app'ens rod med den oprindelige sti i
 * `?spa-path=`. Her pakkes den ud igen og skrives tilbage i adresselinjen, før
 * React Router læser den -- så `/naturklubben/velkommen` åbner
 * bekræftelsessiden, uanset om stien bliver skrevet ind, delt som link eller
 * klikket i en mail.
 *
 * Bemærk at 404-siden beholder både den oprindelige query-streng og fragmentet
 * som rigtige dele af URL'en (kun *stien* pakkes ind). Det er nødvendigt, fordi
 * Supabase-klienten leder efter sessionen fra et mail-link netop dér --
 * `#access_token=...` eller `?code=...` -- og den kigger på adressen allerede
 * når modulet indlæses, altså før denne funktion når at køre.
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
