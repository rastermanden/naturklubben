import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

interface EventOption {
  id: string
  title: string
}

async function fetchEventOptions(): Promise<EventOption[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title')
    .order('start_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data
}

/** Let liste af begivenheder til upload-formularens valgfrie "knyt til begivenhed"-felt. */
export function useEventsForSelect() {
  return useQuery({
    queryKey: ['events-for-select'],
    queryFn: fetchEventOptions,
  })
}
