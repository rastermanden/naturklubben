import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { startOfDay } from './pastEvents'

/**
 * Den offentlige kalender: de begivenheder, en arrangør har åbnet for
 * ikke-medlemmer. Query'en er offentlig i backend med vilje og virker derfor
 * uden login.
 */
export function usePublicEvents(now: Date = new Date()) {
  return useQuery(api.calendar.publicEvents, { dayStart: startOfDay(now) })
}
