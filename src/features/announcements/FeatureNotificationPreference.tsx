import { useFeatureNotificationPreference } from './useFeatureNotificationPreference'

/**
 * Til/fra for notifikationer om nye funktioner. Vises også, når denne browser
 * ikke selv kan tage imod notifikationer -- valget gælder medlemmets øvrige
 * enheder.
 */
export function FeatureNotificationPreference({ userId }: { userId: string }) {
  const { isEnabled, isLoading, isError, isSaving, saveFailed, setEnabled } =
    useFeatureNotificationPreference(userId)

  if (isLoading || isError) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        id="feature-notification-preference"
        type="checkbox"
        checked={isEnabled}
        disabled={isSaving}
        onChange={(event) => setEnabled(event.target.checked)}
        className="h-5 w-5 rounded border-line-strong text-ink-muted disabled:opacity-50"
      />
      <label
        htmlFor="feature-notification-preference"
        className="text-sm text-ink-body"
      >
        Send mig en notifikation, når appen får en ny funktion
      </label>
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
