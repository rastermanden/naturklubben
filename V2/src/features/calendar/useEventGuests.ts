import { useState } from 'react'
import { useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { guestRequestUrl } from './feedUrl'
import {
  GuestRequestError,
  toGuestRequestError,
} from './guestRequestErrors'

// Gæster på åbne begivenheder (#224).
//
// Tre lag med hver sin læseadgang, som i den gamle app:
// - antallet af godkendte gæster står på begivenheden (`approvedGuestCount`),
//   så alle medlemmer kan se det uden at læse ansøgningerne;
// - selve ansøgningerne får kun arrangøren og admins (`guestRequests`);
// - den offentlige formular går gennem HTTP-ruten i `convex/calendarFeed.ts`.

export const MAX_GUEST_PARTY_SIZE = 20

export interface GuestRequestInput {
  eventId: string
  fullName: string
  email: string
  message: string
  partySize: number
}

/**
 * Arrangørens og adminens liste over ansøgninger. `enabled` er `canManage`, så
 * en almindelig deltager ikke engang prøver -- backend ville afvise det.
 */
export function useEventGuestRequests(eventId: string, enabled: boolean) {
  return useQuery(
    api.calendar.guestRequests,
    enabled ? { eventId: eventId as Id<'events'> } : 'skip',
  )
}

/**
 * Den offentlige formular: sender ansøgningen til HTTP-ruten. Der er ingen
 * `useMutation` at bruge, fordi ruten ligger uden for Convex' funktions-API --
 * det er netop pointen, så IP-adressen kan bruges til rate limiting.
 */
export function useSubmitGuestRequest() {
  const [isPending, setPending] = useState(false)

  async function submit(input: GuestRequestInput) {
    if (guestRequestUrl === null) {
      throw new GuestRequestError('temporarily_unavailable')
    }

    setPending(true)
    try {
      const response = await fetch(guestRequestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw await toGuestRequestError(response)
      }
    } finally {
      setPending(false)
    }
  }

  return { submit, isPending }
}
