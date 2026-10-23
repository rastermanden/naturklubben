import { lastDay } from './eventDays'

/**
 * Grænsen mellem kommende og tidligere begivenheder (#257): midnat i dag, lokal
 * tid -- samme grænse som listen over kommende begivenheder bruger. En tur, der
 * slutter i dag, er altså stadig "kommende".
 *
 * Convex' funktioner kører i UTC, så grænsen regnes ud her i browseren og
 * sendes med som `dayStart` til `calendar.upcomingEvents` og `calendar.pastEvents`.
 * Den styrer kun, hvad der vises.
 */
export function startOfDay(now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

/**
 * Afholdt, når begivenhedens sidste dag ligger før i dag. En flerdagstur, der
 * startede i går og slutter i morgen, er altså stadig kommende (#259).
 */
export function isPastEvent(
  event: { startAt: number; endAt: number | null },
  now: Date = new Date(),
): boolean {
  return lastDay(event).getTime() < startOfDay(now)
}

/** Hele måneden [første dag, første dag i næste måned), som ms. */
export function monthRange(month: Date): { from: number; to: number } {
  return {
    from: new Date(month.getFullYear(), month.getMonth(), 1).getTime(),
    to: new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime(),
  }
}

/**
 * Den del af måneden, der ligger før i dag: [første dag i måneden,
 * min(næste måned, midnat i dag)). Resten hentes allerede med de kommende
 * begivenheder. null for en måned, der ligger helt efter i dag.
 */
export function pastRangeOfMonth(
  month: Date,
  now: Date = new Date(),
): { from: number; to: number } | null {
  const from = new Date(month.getFullYear(), month.getMonth(), 1).getTime()
  const nextMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    1,
  ).getTime()
  const today = startOfDay(now)
  if (from >= today) return null
  return { from, to: Math.min(nextMonth, today) }
}
