import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hvor mange billeder der er knyttet til begivenheden (#261), så kalenderen
 * kan linke til dens album i galleriet. Læses fra viewet
 * `gallery_event_photo_counts`, som kun har en række for begivenheder med
 * mindst ét billede -- ingen række er 0 og intet link.
 */
export function useEventPhotoCount(eventId: string) {
  return useQuery({
    queryKey: ['event-photo-count', eventId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('gallery_event_photo_counts')
        .select('photo_count')
        .eq('event_id', eventId)
        .maybeSingle()

      if (error) throw error
      return Number(data?.photo_count ?? 0)
    },
  })
}
