import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hvor meget chatten må sende notifikationer (#179).
 *
 * Valget ligger på profilen, ikke på push_subscriptions: det er personligt og
 * skal gælde alle medlemmets enheder, ikke den ene installation, det blev sat
 * fra. Selve filtreringen sker server-side i chat-push -- klienten kan ikke
 * undlade at modtage en notifikation, den allerede har fået.
 */
export const CHAT_NOTIFICATION_PREFERENCES = [
  'all',
  'mentions',
  'none',
] as const

export type ChatNotificationPreference =
  (typeof CHAT_NOTIFICATION_PREFERENCES)[number]

export const CHAT_NOTIFICATION_LABELS: Record<
  ChatNotificationPreference,
  string
> = {
  all: 'Alle beskeder',
  mentions: 'Kun når jeg nævnes',
  none: 'Ingen',
}

function normalize(value: unknown): ChatNotificationPreference {
  return CHAT_NOTIFICATION_PREFERENCES.includes(
    value as ChatNotificationPreference,
  )
    ? (value as ChatNotificationPreference)
    : 'all'
}

export function chatNotificationPreferenceKey(userId: string) {
  return ['chat-notification-preference', userId] as const
}

export function useChatNotificationPreference(userId: string) {
  const queryClient = useQueryClient()
  const queryKey = chatNotificationPreferenceKey(userId)

  const preferenceQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<ChatNotificationPreference> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('chat_notification_preference')
        .eq('id', userId)
        .single()
      if (error) throw error
      return normalize(data?.chat_notification_preference)
    },
  })

  const setPreference = useMutation({
    mutationFn: async (preference: ChatNotificationPreference) => {
      const { error } = await supabase
        .from('profiles')
        .update({ chat_notification_preference: preference })
        .eq('id', userId)
      if (error) throw error
      return preference
    },
    onSuccess: (preference) => {
      queryClient.setQueryData(queryKey, preference)
    },
  })

  return {
    preference: preferenceQuery.data ?? 'all',
    isLoading: preferenceQuery.isPending,
    isError: preferenceQuery.isError,
    isSaving: setPreference.isPending,
    saveFailed: setPreference.isError,
    setPreference: setPreference.mutate,
  }
}
