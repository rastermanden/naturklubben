import { useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { monthRange, startOfDay } from './pastEvents'

/**
 * Kalenderens læsning. Skrivningen ligger som `useMutation`-kald direkte i
 * siderne -- Convex' queries er abonnementer, så der er intet
 * `invalidateQueries` at gøre efter en mutation: svaret opdateres af sig selv.
 */

/** Kommende begivenheder, også en flerdagstur der er i gang. */
export function useUpcomingEvents(now: Date = new Date()) {
  return useQuery(api.calendar.upcomingEvents, { dayStart: startOfDay(now) })
}

/** Afholdte begivenheder, nyeste først. Hentes først, når nogen beder om dem. */
export function usePastEvents(
  dayStart: number,
  limit?: number,
  enabled = true,
) {
  return useQuery(
    api.calendar.pastEvents,
    enabled ? { dayStart, limit } : 'skip',
  )
}

/** Begivenhederne i en måned -- til månedsvisningen, når man bladrer tilbage. */
export function useMonthEvents(month: Date) {
  const { from, to } = monthRange(month)
  return useQuery(api.calendar.monthEvents, { from, to })
}

/**
 * Én begivenhed med medlemmets eget svar. `eventId` kommer fra URL'en og er
 * derfor en streng; Convex afviser en værdi, der ikke er et id. Svarer `null`,
 * når begivenheden er slettet.
 */
export function useEvent(eventId: string) {
  return useQuery(api.calendar.event, {
    eventId: eventId as Id<'events'>,
  })
}
