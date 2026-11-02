/**
 * Flytningen til naturklubben.dk.
 *
 * Når repoets GitHub Pages får sit eget domæne, svarer GitHub på alt under
 * den gamle adresse med en viderestilling til det nye. Det klarer browseren
 * selv for en almindelig side -- men ikke for den app, medlemmerne har lagt på
 * hjemmeskærmen: dens service worker kører fra den gamle adresse og
 * precacher app-shellen, og browsere nægter at opdatere en service worker,
 * hvis scriptet svarer med en viderestilling. Uden noget andet ville den
 * gamle app blive ved med at åbne, uden nogensinde at opdatere.
 *
 * Derfor spørger appen selv ved start, om den er flyttet: den henter en fil
 * fra sin egen adresse med `redirect: 'manual'`. Før flytningen svarer GitHub
 * 200 og intet sker. Efter flytningen svarer GitHub med en viderestilling --
 * og så viser appen en side, der sender medlemmet til den nye adresse.
 *
 * Rene funktioner her; netværk og React ligger i `useSiteMoved.ts` og
 * `SiteMovedNotice.tsx`.
 */

/** Den gamle adresse. Kun en app, der kører herfra, tjekker. */
export const OLD_HOST = 'rastermanden.github.io'
/** Den gamle base-sti på GitHub Pages. */
export const OLD_BASE_PATH = '/naturklubben/'
/** Den nye adresse, inkl. base-sti. */
export const NEW_APP_URL = 'https://naturklubben.dk/'

/** Skal denne kopi af appen overhovedet holde øje med flytningen? */
export function shouldCheckForMove(location: { hostname: string }): boolean {
  return location.hostname === OLD_HOST
}

/**
 * Filen, der spørges efter: noget, der findes i alle builds, med en
 * query-parameter, så service workerens precache ikke svarer i stedet for
 * netværket.
 */
export function probeUrl(baseUrl: string, now: number): string {
  return `${baseUrl}favicon.svg?flyttet-tjek=${now}`
}

/**
 * Svaret på probe-forespørgslen: `opaqueredirect` er den eneste type, en
 * `redirect: 'manual'`-fetch giver ved en viderestilling. Alt andet -- 200,
 * 404, en netværksfejl -- betyder, at appen ikke (endnu) er flyttet.
 */
export function isMovedResponse(response: { type: string }): boolean {
  return response.type === 'opaqueredirect'
}

/**
 * Den samme side på den nye adresse: `/naturklubben/kalender?x=1#y` bliver
 * `https://naturklubben.dk/kalender?x=1#y`. En sti uden for den gamle base
 * (fx et PR-preview) sendes til forsiden.
 */
export function movedUrl(current: {
  pathname: string
  search: string
  hash: string
}): string {
  const rest = current.pathname.startsWith(OLD_BASE_PATH)
    ? current.pathname.slice(OLD_BASE_PATH.length)
    : ''
  if (rest.startsWith('pr-preview/')) return NEW_APP_URL
  const target = new URL(rest, NEW_APP_URL)
  target.search = current.search
  target.hash = current.hash
  return target.href
}
