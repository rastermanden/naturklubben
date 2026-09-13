import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { capRaised } from './waitlist'

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
  /** Pladsloft; null er ubegrænset. */
  max_participants: number | null
}

export interface EventInput {
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
  is_public: boolean
  max_participants: number | null
}

const eventFields =
  'id, title, description, location, start_at, end_at, created_by, is_public, max_participants'

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
    /**
     * Returnerer dem, der rykkede op fra ventelisten, fordi loftet blev hævet
     * eller fjernet -- så siden kan fortælle dem det i chatten. Oprykningen
     * sker i databasen bag samme lås som tilmeldingerne.
     */
    mutationFn: async ({
      event,
      input,
    }: {
      event: CalendarEvent
      input: EventInput
    }): Promise<string[]> => {
      const { error } = await supabase
        .from('events')
        .update(input)
        .eq('id', event.id)
      if (error) throw error
      if (!capRaised(event.max_participants, input.max_participants)) {
        return []
      }
      const { data, error: promoteError } = await supabase.rpc(
        'promote_event_waitlist',
        { p_event_id: event.id },
      )
      // Begivenheden er gemt; en fejl her må ikke ligne, at den ikke blev det.
      // Pladserne fyldes alligevel ved næste svar på begivenheden.
      if (promoteError) {
        console.warn('Ventelisten kunne ikke rykkes op', promoteError)
        return []
      }
      return (data as string[] | null) ?? []
    },
    onSuccess: (_promoted, { event }) => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({
        queryKey: ['event-attendance', event.id],
      })
    },
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
