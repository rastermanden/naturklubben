import type { AdminBadge } from './types'

/**
 * Hvornår en rendering er død frem for i gang.
 *
 * Matcher `PRINT_CLAIM_STALE_MS` i `V2/convex/badges.ts`: så længe serveren
 * afviser et nyt claim, er renderingen reelt i gang, og bagefter kan den
 * startes forfra.
 */
export const STALE_BADGE_PRINT_MS = 2 * 60 * 1000

export type BadgePrintFields = Pick<
  AdminBadge,
  'printStatus' | 'printStartedAt' | 'updatedAt'
>

/** En rendering, der aldrig meldte tilbage -- fx fordi fanen blev lukket. */
export function isStalePrintRender(badge: BadgePrintFields, now = Date.now()) {
  if (badge.printStatus !== 'rendering') return false
  if (badge.printStartedAt === undefined) return true
  return badge.printStartedAt <= now - STALE_BADGE_PRINT_MS
}

export function printStatusLabel(badge: BadgePrintFields, now = Date.now()) {
  switch (badge.printStatus) {
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
