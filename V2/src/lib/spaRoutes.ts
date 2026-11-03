/**
 * Statiske ruter, der skal have deres egen `index.html` i buildet.
 *
 * GitHub Pages serverer kun filer, der findes. Uden en kopi svarer
 * `/kalender` med rodens 404, og den viderestilling taber både ruten og
 * sessionen. Listen skal følge de ruter, der ikke har et `:param` — det
 * tjekker `spaRoutes.test.ts`.
 */
export const spaIndexPaths = [
  'aktiviteter',
  'aktiviteter/btg-turnering',
  'admin',
  'admin/chat',
  'billeder',
  'chat',
  'datapolitik',
  'glemt-adgangskode',
  'kalender',
  'kalender/offentlig',
  'konto-slettet',
  'login',
  'medlemmer',
  'naturlog',
  'ny-adgangskode',
  'nyheder',
  'opret',
  'profil',
  'proevemedlemskab',
  'spil',
  'spil/2048',
  'spil/bobler',
  'spil/fugletraek',
  'spil/kabale',
  'spil/kaper',
  'spil/naturquiz',
  'spil/sti',
  'spil/tetris',
  'velkommen',
] as const

/** Relativ sti i `dist/`, fx `kalender/offentlig/index.html`. */
export function spaIndexFile(route: string): string {
  const clean = route.replace(/^\/+/, '').replace(/\/+$/, '')
  if (
    clean.length === 0 ||
    clean.split('/').some((part) => part === '..' || part.includes(':'))
  ) {
    throw new Error('SPA_ROUTE_INVALID')
  }
  return `${clean}/index.html`
}
