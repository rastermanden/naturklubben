import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'

export function isAdminQueryKey(userId: string) {
  return ['profiles', userId, 'is_admin'] as const
}

/** Slår op om den aktuelle bruger har profiles.is_admin sat. */
export function useIsAdmin() {
  const { session } = useAuth()
  const userId = session?.user.id

  const query = useQuery({
    queryKey: isAdminQueryKey(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data.is_admin === true
    },
  })

  return {
    isAdmin: query.data === true,
    // En deaktiveret query bliver i pending for evigt, så uden session venter vi ikke.
    loading: Boolean(userId) && query.isPending,
  }
}
