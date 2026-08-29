// Værdierne inlines af `define` i vite.config.ts. Uden for et Vite-build --
// fx i Vitest, som har sin egen config -- findes de ikke, og `typeof` er den
// eneste måde at spørge efter dem uden at kaste en ReferenceError.
declare const __APP_VERSION__: string | undefined
declare const __APP_BUILD_DATE__: string | undefined

export const appVersion =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'udvikling'

export const appBuildDate =
  typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : null

/**
 * Sætter version og dato sammen til den linje, footeren viser.
 *
 * Datoen er commit-datoen, ikke byggetidspunktet, så den samme kode altid
 * giver den samme linje. Kan datoen ikke læses, vises versionen alene --
 * en halv linje er stadig noget, et medlem kan læse op i en fejlbeskrivelse.
 */
export function formatAppVersion(version: string, buildDate: string | null) {
  if (!buildDate) return version

  const date = new Date(buildDate)
  if (Number.isNaN(date.getTime())) return version

  const formatted = new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

  return `${version} · ${formatted}`
}
