import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { useCurrentProfile } from '../auth/useCurrentProfile'

const CHAT_NOTIFICATION_PREFERENCES = ['all', 'mentions', 'none'] as const

type ChatNotificationPreference = Doc<'profiles'>['chatNotificationPreference']

const CHAT_NOTIFICATION_LABELS: Record<ChatNotificationPreference, string> = {
  all: 'Alle beskeder',
  mentions: 'Kun når jeg nævnes',
  none: 'Ingen',
}

/**
 * Valget mellem alle beskeder, kun mentions og ingen. Det står, hvor
 * notifikationsknappen står, fordi det er det samme spørgsmål set fra to
 * sider: om man vil forstyrres, og hvor meget.
 *
 * Feltet vises også, når denne browser ikke selv kan tage imod notifikationer
 * -- valget gælder medlemmets øvrige enheder.
 */
export function ChatNotificationPreference() {
  const { profile, isLoading } = useCurrentProfile()
  const updateProfile = useMutation(api.members.updateProfile)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  if (isLoading || !profile) return null

  const preference: ChatNotificationPreference =
    profile.chatNotificationPreference ?? 'all'

  async function handleChange(next: ChatNotificationPreference) {
    setIsSaving(true)
    setSaveFailed(false)
    try {
      await updateProfile({ chatNotificationPreference: next })
    } catch (caught) {
      console.error('Kunne ikke gemme chat-notifikationsvalget', caught)
      setSaveFailed(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="chat-notification-preference"
        className="text-sm text-ink-body"
      >
        Notifikationer fra chatten
      </label>
      <select
        id="chat-notification-preference"
        value={preference}
        disabled={isSaving}
        onChange={(event) =>
          void handleChange(event.target.value as ChatNotificationPreference)
        }
        className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
      >
        {CHAT_NOTIFICATION_PREFERENCES.map((option) => (
          <option key={option} value={option}>
            {CHAT_NOTIFICATION_LABELS[option]}
          </option>
        ))}
      </select>
      {isSaving && (
        <span role="status" className="text-sm text-ink-subtle">
          Gemmer…
        </span>
      )}
      {saveFailed && (
        <span role="alert" className="text-sm text-danger">
          Valget kunne ikke gemmes. Prøv igen.
        </span>
      )}
    </div>
  )
}
