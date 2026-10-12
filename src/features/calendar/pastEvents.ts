import { lastDay } from './eventDays'

/**
 * Grænsen mellem kommende og tidligere begivenheder (#257): midnat i dag,
 * lokal tid -- samme grænse som listen over kommende begivenheder bruger. En
 * tur, der slutter i dag, er altså stadig "kommende", så man kan nå at melde
 * sig til eller fra, til dagen er omme.
 */
export function startOfDay(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

/**
 * Afholdt, når begivenhedens sidste dag ligger før i dag. En flerdagstur, der
 * startede i går og slutter i morgen, er altså stadig kommende (#259).
 */
export function isPastEvent(
  event: { start_at: string; end_at: string | null },
  now: Date = new Date(),
): boolean {
  return lastDay(event) < startOfDay(now)
}

/**
 * Den del af måneden, der ligger før i dag: [første dag i måneden, min(næste
 * måned, midnat i dag)). Resten hentes allerede med de kommende
 * begivenheder. null for en måned, der ligger helt efter i dag.
 */
export function pastRangeOfMonth(
  month: Date,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  const from = new Date(month.getFullYear(), month.getMonth(), 1)
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const today = startOfDay(now)
  if (from >= today) return null
  return { from, to: nextMonth < today ? nextMonth : today }
}
