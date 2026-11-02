import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from '../../../convex/tables/notifications'

/**
 * Notifikationerne ud over chatten: præferencer pr. type.
 *
 * Typerne selv og deres rækkefølge kommer fra `convex/tables/notifications.ts`
 * -- samme liste, som databasens `v.union` bruger, så en ny type kun skal
 * skrives ét sted. Ingen række betyder "ja tak", og filtreringen sker på
 * serveren: en klient kan ikke undlade at modtage en notifikation, den allerede
 * har fået.
 */
export { NOTIFICATION_KINDS, type NotificationKind }

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  event_created: 'Når der kommer en ny begivenhed i kalenderen',
  event_reminder: 'Dagen før en begivenhed, jeg er tilmeldt',
  waitlist_promoted: 'Når jeg rykker op fra ventelisten på en tur',
  badge_nomination_review:
    'Når et medlem indstilles til en badge, der skal godkendes',
}

/** Typer, kun admins får -- og derfor kun admins ser på profilen. */
export const ADMIN_ONLY_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'badge_nomination_review',
]

export type NotificationPreferences = Record<NotificationKind, boolean>

function allEnabled(): NotificationPreferences {
  const preferences = {} as NotificationPreferences
  for (const kind of NOTIFICATION_KINDS) preferences[kind] = true
  return preferences
}

export function useNotificationPreferences() {
  const stored = useQuery(api.notifications.preferences)
  const setPreference = useMutation(api.notifications.setPreference)
  const [savingKind, setSavingKind] = useState<NotificationKind | undefined>()
  const [saveFailed, setSaveFailed] = useState(false)

  async function setEnabled({
    kind,
    enabled,
  }: {
    kind: NotificationKind
    enabled: boolean
  }) {
    setSavingKind(kind)
    setSaveFailed(false)
    try {
      await setPreference({ kind, enabled })
    } catch (caught) {
      console.error('Kunne ikke gemme notifikationsvalget', caught)
      setSaveFailed(true)
    } finally {
      setSavingKind(undefined)
    }
  }

  return {
    // Convex-abonnementet opdaterer sig selv, så svaret her er altid det, der
    // står i databasen -- der er ingen lokal kopi at holde styr på.
    preferences: stored ?? allEnabled(),
    isLoading: stored === undefined,
    savingKind,
    saveFailed,
    setEnabled,
  }
}
