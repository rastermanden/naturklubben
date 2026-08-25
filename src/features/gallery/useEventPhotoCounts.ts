import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface EventPhotoCount {
  event_id: string
  title: string
  photo_count: number
}

async function fetchEventPhotoCounts(): Promise<EventPhotoCount[]> {
  const { data, error } = await supabase
    .from('gallery_event_photo_counts')
    .select('event_id, title, photo_count')
    .order('title', { ascending: true })

  if (error) throw error
  return data
}

/** Begivenheder med mindst ét billede, til galleriets filter-dropdown (#149). */
export function useEventPhotoCounts() {
  return useQuery({
    queryKey: ['gallery-event-photo-counts'],
    queryFn: fetchEventPhotoCounts,
  })
}
