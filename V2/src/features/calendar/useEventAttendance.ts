import { useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'

/**
 * Deltagerlisten og svarene på en begivenhed.
 *
 * Der er ingen optimistisk opdatering: Convex sender ændringen tilbage til alle
 * abonnenter, så listen retter sig selv, så snart mutationen er gennemført. Det
 * er både hurtigere og mere rigtigt end at gætte pladsen på forhånd -- plads
 * eller venteliste afgøres i backend.
 */
export function useAttendance(eventId: string) {
  return useQuery(api.calendar.attendance, {
    eventId: eventId as Id<'events'>,
  })
}

/**
 * Medlemmerne uden svar. Kun arrangøren og admins får listen, så den hentes
 * først, når den foldes ud (`enabled`).
 */
export function useMembersWithoutResponse(eventId: string, enabled: boolean) {
  return useQuery(
    api.calendar.membersWithoutResponse,
    enabled ? { eventId: eventId as Id<'events'> } : 'skip',
  )
}
