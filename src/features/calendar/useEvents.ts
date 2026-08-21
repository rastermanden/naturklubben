import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
  created_by: string
}

export interface EventInput {
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
}

const eventFields =
  'id, title, description, location, start_at, end_at, created_by'

async function fetchUpcomingEvents(): Promise<CalendarEvent[]> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('events')
    .select(eventFields)
    .gte('start_at', startOfToday.toISOString())
    .order('start_at', { ascending: true })

  if (error) throw error
  return data
}

export function useEvents(userId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['events', 'upcoming']

  const eventsQuery = useQuery({
    queryKey,
    queryFn: fetchUpcomingEvents,
  })

  const createEvent = useMutation({
    mutationFn: async (input: EventInput) => {
      const { error } = await supabase
        .from('events')
        .insert({ ...input, created_by: userId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const updateEvent = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: EventInput }) => {
      const { error } = await supabase.from('events').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { eventsQuery, createEvent, updateEvent, deleteEvent }
}
