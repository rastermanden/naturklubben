import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { notOverFilter } from './eventDays'

/**
 * En offentlig begivenhed, som viewet `public_events` udleverer til anon:
 * ingen arrangør, intet oprettelsestidspunkt (#224).
 */
export interface PublicEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
}

const publicEventFields = 'id, title, description, location, start_at, end_at'

export const publicEventsQueryKey = ['public-events', 'upcoming'] as const

export async function fetchUpcomingPublicEvents(): Promise<PublicEvent[]> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('public_events')
    .select(publicEventFields)
    // En flerdagstur, der er i gang, kan man stadig søge om (#259) --
    // databasen tager imod ansøgninger, til coalesce(end_at, start_at) er gået.
    .or(notOverFilter(startOfToday))
    .order('start_at', { ascending: true })

  if (error) throw error
  return data
}

export function usePublicEvents() {
  return useQuery({
    queryKey: publicEventsQueryKey,
    queryFn: fetchUpcomingPublicEvents,
  })
}
