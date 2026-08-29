import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

/**
 * Om medlemmet vil have en notifikation, når appen får en ny funktion.
 *
 * Valget ligger på profilen og ikke på push_subscriptions -- det er personligt
 * og skal gælde alle medlemmets enheder, ikke den ene, det blev sat fra. Samme
 * begrundelse som chat_notification_preference (#179), og filtreringen sker
 * samme sted: på serveren, i feature-announcements.
 */
export function featureNotificationPreferenceKey(userId: string) {
  return ['feature-notification-preference', userId] as const
}

export function useFeatureNotificationPreference(userId: string) {
  const queryClient = useQueryClient()
  const queryKey = featureNotificationPreferenceKey(userId)

  const preferenceQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('feature_notifications_enabled')
        .eq('id', userId)
        .single()
      if (error) throw error
      // En manglende værdi er ikke et nej: kolonnen har default true, så det
      // eneste, der kan mangle, er svaret -- ikke medlemmets valg.
      return data?.feature_notifications_enabled !== false
    },
  })

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ feature_notifications_enabled: enabled })
        .eq('id', userId)
      if (error) throw error
      return enabled
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(queryKey, enabled)
    },
  })

  return {
    isEnabled: preferenceQuery.data ?? true,
    isLoading: preferenceQuery.isPending,
    isError: preferenceQuery.isError,
    isSaving: setEnabled.isPending,
    saveFailed: setEnabled.isError,
    setEnabled: setEnabled.mutate,
  }
}
