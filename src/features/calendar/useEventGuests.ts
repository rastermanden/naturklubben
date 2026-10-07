import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { toGuestRequestError } from './guestRequestErrors'

// Gæster på åbne begivenheder (#224).
//
// Tre lag med hver sin læseadgang:
// - `event_guest_counts`: alle medlemmer ser antallet af godkendte gæster.
// - `event_guest_requests`: kun arrangøren og admins ser selve ansøgningerne
//   (RLS); afgørelser går gennem security definer-RPC'er.
// - `submit-event-guest-request`: den offentlige formular uden login.
//
// Svaret til ansøgeren sendes ikke længere automatisk (#239): arrangøren
// skriver selv via en mailto:-knap i `GuestRequestsSection`, se
// `guestReplyMailto.ts`.

export type GuestRequestStatus = 'pending' | 'approved' | 'rejected'

export interface EventGuestRequest {
  id: string
  event_id: string
  full_name: string
  email: string
  message: string | null
  party_size: number
  status: GuestRequestStatus
  created_at: string
}

export interface GuestRequestInput {
  eventId: string
  fullName: string
  email: string
  message: string
  partySize: number
}

const guestRequestFields =
  'id, event_id, full_name, email, message, party_size, status, created_at'
const submissionFunction = 'submit-event-guest-request'

export function guestCountQueryKey(eventId: string) {
  return ['event-guest-count', eventId] as const
}

export function guestRequestsQueryKey(eventId: string) {
  return ['event-guest-requests', eventId] as const
}

/** Antal godkendte gæster (personer, ikke ansøgninger). Synligt for alle medlemmer. */
export function useEventGuestCount(eventId: string) {
  return useQuery({
    queryKey: guestCountQueryKey(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_guest_counts')
        .select('guest_count')
        .eq('event_id', eventId)
        .maybeSingle<{ guest_count: number }>()
      if (error) throw error
      return data?.guest_count ?? 0
    },
  })
}

async function fetchGuestRequests(
  eventId: string,
): Promise<EventGuestRequest[]> {
  const { data, error } = await supabase
    .from('event_guest_requests')
    .select(guestRequestFields)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

async function decideRequest(
  requestId: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  const { error } = await supabase.rpc(
    decision === 'approve'
      ? 'approve_event_guest_request'
      : 'reject_event_guest_request',
    { request_id: requestId },
  )
  if (error) throw error
}

/** Arrangørens/adminens liste over ansøgninger på én begivenhed. */
export function useEventGuestRequests(eventId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const queryKey = guestRequestsQueryKey(eventId)

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: guestCountQueryKey(eventId),
      }),
    ])
  }

  const requestsQuery = useQuery({
    queryKey,
    enabled,
    queryFn: () => fetchGuestRequests(eventId),
  })

  const approveRequest = useMutation({
    mutationFn: (requestId: string) => decideRequest(requestId, 'approve'),
    onSettled: invalidate,
  })

  const rejectRequest = useMutation({
    mutationFn: (requestId: string) => decideRequest(requestId, 'reject'),
    onSettled: invalidate,
  })

  return { requestsQuery, approveRequest, rejectRequest }
}

/** Den offentlige formular: sender ansøgningen gennem Edge Functionen. */
export function useSubmitGuestRequest() {
  return useMutation({
    mutationFn: async ({
      eventId,
      fullName,
      email,
      message,
      partySize,
    }: GuestRequestInput) => {
      const { data, error } = await supabase.functions.invoke<{
        accepted?: boolean
      }>(submissionFunction, {
        body: { eventId, fullName, email, message, partySize },
      })

      if (error) throw await toGuestRequestError(error)
      if (data?.accepted !== true) {
        throw new Error('Serveren svarede uden en kvittering.')
      }
    },
  })
}
