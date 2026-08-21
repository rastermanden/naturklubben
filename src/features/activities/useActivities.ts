import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface Activity {
  id: string
  title: string
  description: string
  icon: string | null
  sort_order: number
}

async function fetchActivities(limit?: number): Promise<Activity[]> {
  let query = supabase
    .from('activities')
    .select('id, title, description, icon, sort_order')
    .order('sort_order', { ascending: true })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export function useActivities(limit?: number) {
  return useQuery({
    queryKey: ['activities', limit ?? 'all'],
    queryFn: () => fetchActivities(limit),
  })
}
