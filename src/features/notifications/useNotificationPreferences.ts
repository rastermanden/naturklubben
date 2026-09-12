import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

/**
 * Notifikationerne ud over chatten (#216): ny begivenhed, påmindelse dagen
 * før og -- for admins -- en ny indstilling til en badge, der skal godkendes.
 * Hver med sit eget til/fra.
 *
 * Valget ligger i notification_preferences, én række pr. (medlem, type), og
 * gælder alle medlemmets enheder, ligesom chat_notification_preference. Ingen
 * række er et ja: typerne er slået til for alle, indtil man selv rører dem.
 * Skrivning går gennem set_notification_preference, så en klient aldrig kan
 * sætte et valg for nogen anden, og filtreringen sker på serveren -- en klient
 * kan ikke undlade at modtage en notifikation, den allerede har fået.
 */
export const NOTIFICATION_KINDS = [
  'event_created',
  'event_reminder',
  'badge_nomination_review',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  event_created: 'Når der kommer en ny begivenhed i kalenderen',
  event_reminder: 'Dagen før en begivenhed, jeg er tilmeldt',
  badge_nomination_review:
    'Når et medlem indstilles til en badge, der skal godkendes',
}

/** Typer, kun admins får -- og derfor kun admins ser på profilen. */
export const ADMIN_ONLY_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'badge_nomination_review',
]

export type NotificationPreferences = Record<NotificationKind, boolean>

export function notificationPreferencesKey(userId: string) {
  return ['notification-preferences', userId] as const
}

function allEnabled(): NotificationPreferences {
  return {
    event_created: true,
    event_reminder: true,
    badge_nomination_review: true,
  }
}

export function useNotificationPreferences(userId: string) {
  const queryClient = useQueryClient()
  const queryKey = notificationPreferencesKey(userId)

  const preferencesQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<NotificationPreferences> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('kind, enabled')
        .eq('user_id', userId)
      if (error) throw error
      const preferences = allEnabled()
      for (const row of data ?? []) {
        if (NOTIFICATION_KINDS.includes(row.kind as NotificationKind)) {
          preferences[row.kind as NotificationKind] = row.enabled !== false
        }
      }
      return preferences
    },
  })

  const setEnabled = useMutation({
    mutationFn: async ({
      kind,
      enabled,
    }: {
      kind: NotificationKind
      enabled: boolean
    }) => {
      const { error } = await supabase.rpc('set_notification_preference', {
        p_kind: kind,
        p_enabled: enabled,
      })
      if (error) throw error
      return { kind, enabled }
    },
    onSuccess: ({ kind, enabled }) => {
      queryClient.setQueryData<NotificationPreferences>(
        queryKey,
        (current) => ({
          ...(current ?? allEnabled()),
          [kind]: enabled,
        }),
      )
    },
  })

  return {
    preferences: preferencesQuery.data ?? allEnabled(),
    isLoading: preferencesQuery.isPending,
    isError: preferencesQuery.isError,
    isSaving: setEnabled.isPending,
    savingKind: setEnabled.isPending ? setEnabled.variables?.kind : undefined,
    saveFailed: setEnabled.isError,
    setEnabled: setEnabled.mutate,
  }
}
