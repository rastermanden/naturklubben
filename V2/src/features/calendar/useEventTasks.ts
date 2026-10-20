import { useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'

/** Opgavelisten på en begivenhed. Alle medlemmer må se og ændre den. */
export function useEventTasks(eventId: string) {
  return useQuery(api.calendar.tasks, { eventId: eventId as Id<'events'> })
}
