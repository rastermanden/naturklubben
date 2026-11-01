/**
 * Hvor 404.html skal sende browseren hen.
 *
 * GitHub Pages serverer kun rodens `404.html` for en sti, der ikke findes.
 * Den side kender produktionens base (`/`) og skal derfor selv opdage
 * `/pr-preview/pr-<nr>/`, så et direkte link til previewet lander i previewets
 * app og ikke i produktionens. Previewets egen 404.html bruger sin base
 * (`/pr-preview/pr-<nr>/`) og pakker resten ind som `spa-path`.
 *
 * `null` betyder "lad være": stien ligner en fil, og en viderestilling ville
 * skjule, at filen mangler.
 *
 * Funktionen er bevidst uden TypeScript-only-syntaks. `vite.config.ts` sætter
 * dens kildekode ind i 404.html, så den skal kunne køre, som den står.
 */
export function computeSpaFallback(
  base: string,
  pathname: string,
  search: string,
  hash: string,
): string | null {
  let current = base
  if (pathname.indexOf(current) !== 0) return current
  let rest = pathname.slice(current.length)
  const preview = rest.match(/^pr-preview[/]pr-[0-9]+[/]/)
  if (preview !== null) {
    current += preview[0]
    rest = rest.slice(preview[0].length)
  }
  if (/[.][^/]+$/.test(rest)) return null
  const query = search.length > 0 ? search.slice(1) + '&' : ''
  return current + '?' + query + 'spa-path=' + encodeURIComponent(rest) + hash
}
