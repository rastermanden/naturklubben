import type { Badge } from './types'

/**
 * Hvornår en rendering er død frem for i gang.
 *
 * Tallet skal matche intervallet i claim_badge_print (migrationen
 * 20260829080000_badge_print_stale_claim.sql): så længe databasen afviser et
 * nyt claim, er renderingen reelt i gang, og bagefter er den til at starte
 * forfra. Viser UI'et noget andet, sender vi enten admin efter en fil, der
 * aldrig kommer, eller efter en knap, der ikke virker endnu.
 */
export const STALE_BADGE_PRINT_MS = 2 * 60 * 1000

/**
 * Vinduet efter en gemning, hvor en 'pending' badge venter på, at
 * render-badge-print når at claime den. Uden det ville kataloget ikke opdage,
 * at trykfilen er på vej, i sekunderne mellem gemningen og claim'et.
 */
export const PENDING_BADGE_PRINT_MS = 60 * 1000

/** Hvor tit kataloget henter sig selv, mens en trykfil er undervejs. */
export const BADGE_PRINT_POLL_MS = 4000

type BadgePrintFields = Pick<
  Badge,
  'print_status' | 'print_started_at' | 'updated_at'
>

/** En rendering, der aldrig meldte tilbage -- fx fordi workeren døde. */
export function isStalePrintRender(badge: BadgePrintFields, now = Date.now()) {
  if (badge.print_status !== 'rendering') return false
  if (!badge.print_started_at) return true
  return (
    new Date(badge.print_started_at).getTime() <= now - STALE_BADGE_PRINT_MS
  )
}

/** Sandt, hvis der er grund til at vente på et nyt svar fra databasen. */
export function isPrintRenderInFlight(
  badge: BadgePrintFields,
  now = Date.now(),
) {
  if (badge.print_status === 'rendering') return !isStalePrintRender(badge, now)
  return (
    badge.print_status === 'pending' &&
    new Date(badge.updated_at).getTime() > now - PENDING_BADGE_PRINT_MS
  )
}

export function badgePrintPollInterval(
  badges: BadgePrintFields[] | undefined,
  now = Date.now(),
): number | false {
  return (badges ?? []).some((badge) => isPrintRenderInFlight(badge, now))
    ? BADGE_PRINT_POLL_MS
    : false
}

export function printStatusLabel(badge: BadgePrintFields, now = Date.now()) {
  switch (badge.print_status) {
    case 'ready':
      return 'Trykfil klar'
    case 'failed':
      return 'Trykfilen fejlede'
    case 'rendering':
      return isStalePrintRender(badge, now)
        ? 'Trykfilen gik i stå'
        : 'Trykfilen laves…'
    case 'pending':
      return 'Trykfilen mangler'
  }
}
