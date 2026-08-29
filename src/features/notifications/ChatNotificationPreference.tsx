import {
  CHAT_NOTIFICATION_LABELS,
  CHAT_NOTIFICATION_PREFERENCES,
  useChatNotificationPreference,
} from './useChatNotificationPreference'
import type { ChatNotificationPreference as Preference } from './useChatNotificationPreference'

/**
 * Valget mellem alle beskeder, kun mentions og ingen. Det står, hvor
 * notifikationsknappen står, fordi det er det samme spørgsmål set fra to
 * sider: om man vil forstyrres, og hvor meget.
 *
 * Feltet vises også, når denne browser ikke selv kan tage imod notifikationer
 * -- valget gælder medlemmets øvrige enheder.
 */
export function ChatNotificationPreference({ userId }: { userId: string }) {
  const {
    preference,
    isLoading,
    isError,
    isSaving,
    saveFailed,
    setPreference,
  } = useChatNotificationPreference(userId)

  if (isLoading || isError) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="chat-notification-preference"
        className="text-sm text-green-900"
      >
        Notifikationer fra chatten
      </label>
      <select
        id="chat-notification-preference"
        value={preference}
        disabled={isSaving}
        onChange={(event) => setPreference(event.target.value as Preference)}
        className="min-h-11 rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-green-950 disabled:opacity-50"
      >
        {CHAT_NOTIFICATION_PREFERENCES.map((option) => (
          <option key={option} value={option}>
            {CHAT_NOTIFICATION_LABELS[option]}
          </option>
        ))}
      </select>
      {isSaving && (
        <span role="status" className="text-sm text-green-700">
          Gemmer…
        </span>
      )}
      {saveFailed && (
        <span role="alert" className="text-sm text-red-700">
          Valget kunne ikke gemmes. Prøv igen.
        </span>
      )}
    </div>
  )
}
