import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface EventAttendance {
  event_id: string
  user_id: string
  created_at: string
}

const attendanceFields = 'event_id, user_id, created_at'

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

export function useEventAttendance(eventId: string, userId: string) {
  const queryClient = useQueryClient()
  const queryKey = attendanceQueryKey(eventId)

  const attendanceQuery = useQuery({
    queryKey,
    queryFn: () => fetchEventAttendance(eventId),
  })

  const joinAttendance = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('event_attendance')
        .insert({ event_id: eventId, user_id: userId })
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous =
        queryClient.getQueryData<EventAttendance[]>(queryKey) ?? []

      queryClient.setQueryData<EventAttendance[]>(queryKey, [
        ...previous,
        {
          event_id: eventId,
          user_id: userId,
          created_at: new Date().toISOString(),
        },
      ])

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const leaveAttendance = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('event_attendance')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous =
        queryClient.getQueryData<EventAttendance[]>(queryKey) ?? []

      queryClient.setQueryData<EventAttendance[]>(
        queryKey,
        previous.filter((attendance) => attendance.user_id !== userId),
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { attendanceQuery, joinAttendance, leaveAttendance }
}
