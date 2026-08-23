import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface Member {
  id: string
  full_name: string | null
  avatar_url: string | null
  chat_color: string | null
  is_admin: boolean
  created_at: string
}

async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, chat_color, is_admin, created_at')
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return data ?? []
}

export function useMembers() {
  return useQuery({
    queryKey: ['profiles', 'members'],
    queryFn: fetchMembers,
  })
}
