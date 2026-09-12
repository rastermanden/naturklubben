import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import {
  expectedResponseStatus,
  type AttendanceEntry,
  type AttendanceStatus,
} from './waitlist'

export interface EventAttendance extends AttendanceEntry {
  event_id: string
}

/** Det, man kan svare: tilmelding, afbud, eller trække svaret tilbage. */
export type AttendanceResponse = 'attending' | 'declined' | 'none'

export interface RespondResult {
  status: AttendanceStatus | null
  /** Dem, svaret rykkede op fra ventelisten, i rækkefølge. */
  promoted: string[]
}

const attendanceFields = 'event_id, user_id, status, created_at'

function attendanceQueryKey(eventId: string) {
  return ['event-attendance', eventId] as const
}

async function fetchEventAttendance(
  eventId: string,
): Promise<EventAttendance[]> {
  const { data, error } = await supabase
    .from('event_attendance')
    .select(attendanceFields)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Det svar, listen viser, mens databasen arbejder. Pladsen afgøres bag en lås
 * i respond_to_event; her gættes det samme ud fra den liste, klienten har, og
 * onSettled henter facit.
 */
export function applyOptimisticResponse(
  previous: readonly EventAttendance[],
  eventId: string,
  userId: string,
  response: AttendanceResponse,
  maxParticipants: number | null,
): EventAttendance[] {
  const own = previous.find((entry) => entry.user_id === userId)
  const others = previous.filter((entry) => entry.user_id !== userId)
  if (response === 'none') return others
  if (
    response === 'attending' &&
    own &&
    (own.status === 'attending' || own.status === 'waitlisted')
  ) {
    return [...previous]
  }
  const status =
    response === 'declined'
      ? 'declined'
      : expectedResponseStatus(others, maxParticipants)
  return [
    ...others,
    {
      event_id: eventId,
      user_id: userId,
      status,
      created_at: new Date().toISOString(),
    },
  ]
}

export function useEventAttendance(
  eventId: string,
  userId: string,
  maxParticipants: number | null,
) {
  const queryClient = useQueryClient()
  const queryKey = attendanceQueryKey(eventId)

  const attendanceQuery = useQuery({
    queryKey,
    queryFn: () => fetchEventAttendance(eventId),
  })

  const respond = useMutation({
    mutationFn: async (response: AttendanceResponse) => {
      const { data, error } = await supabase.rpc('respond_to_event', {
        p_event_id: eventId,
        p_response: response,
      })
      if (error) throw error
      return data as RespondResult
    },
    onMutate: async (response) => {
      await queryClient.cancelQueries({ queryKey })
      const previous =
        queryClient.getQueryData<EventAttendance[]>(queryKey) ?? []

      queryClient.setQueryData<EventAttendance[]>(
        queryKey,
        applyOptimisticResponse(
          previous,
          eventId,
          userId,
          response,
          maxParticipants,
        ),
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { attendanceQuery, respond }
}

/**
 * Medlemmerne uden svar på begivenheden. RPC'en afviser alle andre end
 * arrangøren og admins, så den hentes først, når listen faktisk foldes ud.
 */
export function useMembersWithoutResponse(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['event-members-without-response', eventId] as const,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc(
        'event_members_without_response',
        { p_event_id: eventId },
      )
      if (error) throw error
      return (data as { user_id: string }[]).map((row) => row.user_id)
    },
    enabled,
  })
}
