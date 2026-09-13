import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
  created_by: string | null
  /** Åben for ikke-medlemmer: vises på den offentlige kalender (#224). */
  is_public: boolean
}

export interface EventInput {
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
  is_public: boolean
}

const eventFields =
  'id, title, description, location, start_at, end_at, created_by, is_public'

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

/**
 * Beder calendar-push give de andre medlemmer besked om den nye begivenhed
 * (#216). Samme mønster som chat-push efter en besked: begivenheden er
 * allerede gemt og vist, så en fejl her må ikke vælte oprettelsen -- de andre
 * går bare glip af *notifikationen*, ikke af begivenheden.
 *
 * Kun id'et sendes med; functionen slår selv begivenheden op, nægter at sende
 * for en, kalderen ikke selv har oprettet, og sorterer dem fra, der har slået
 * typen fra.
 */
async function notifyOthers(eventId: string) {
  const { error } = await supabase.functions.invoke('calendar-push', {
    body: { kind: 'event_created', eventId },
  })
  if (error) console.warn('Notifikationer kunne ikke sendes', error)
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
      const { data, error } = await supabase
        .from('events')
        .insert({ ...input, created_by: userId })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (eventId) => {
      // Ikke afventet: formularen skal lukke, når begivenheden er gemt -- ikke
      // når push-tjenesterne har svaret.
      void notifyOthers(eventId)
      return queryClient.invalidateQueries({ queryKey })
    },
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
