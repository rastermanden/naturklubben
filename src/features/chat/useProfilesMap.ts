import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface ProfileSummary {
  full_name: string | null
  avatar_url: string | null
  chat_color: string | null
}

async function fetchProfiles(): Promise<Record<string, ProfileSummary>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, chat_color')
  if (error) throw error

  return Object.fromEntries(
    data.map(({ id, full_name, avatar_url, chat_color }) => [
      id,
      { full_name, avatar_url, chat_color },
    ]),
  )
}

export function useProfilesMap() {
  return useQuery({
    queryKey: ['profiles', 'map'],
    queryFn: fetchProfiles,
    staleTime: 5 * 60 * 1000,
  })
}
