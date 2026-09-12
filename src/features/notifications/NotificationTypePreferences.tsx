import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_LABELS,
  useNotificationPreferences,
} from './useNotificationPreferences'

/**
 * Til/fra for hver af notifikationerne ud over chatten (#216). Hvert valg
 * gemmes med det samme, ligesom chat- og nyhedsvalget -- der er ikke noget
 * "Gem" at glemme. Vises også, når denne browser ikke selv kan tage imod
 * notifikationer: valget gælder medlemmets øvrige enheder.
 */
export function NotificationTypePreferences({ userId }: { userId: string }) {
  const {
    preferences,
    isLoading,
    isError,
    isSaving,
    savingKind,
    saveFailed,
    setEnabled,
  } = useNotificationPreferences(userId)

  if (isLoading || isError) return null

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink-body">
        Send mig en notifikation …
      </legend>
      {NOTIFICATION_KINDS.map((kind) => {
        const id = `notification-preference-${kind}`
        return (
          <div key={kind} className="flex flex-wrap items-center gap-2">
            <input
              id={id}
              type="checkbox"
              checked={preferences[kind]}
              disabled={isSaving}
              onChange={(event) =>
                setEnabled({ kind, enabled: event.target.checked })
              }
              className="h-5 w-5 rounded border-line-strong text-ink-muted disabled:opacity-50"
            />
            <label htmlFor={id} className="text-sm text-ink-body">
              {NOTIFICATION_KIND_LABELS[kind]}
            </label>
            {savingKind === kind && (
              <span role="status" className="text-sm text-ink-subtle">
                Gemmer…
              </span>
            )}
          </div>
        )
      })}
      {saveFailed && (
        <p role="alert" className="text-sm text-danger">
          Valget kunne ikke gemmes. Prøv igen.
        </p>
      )}
    </fieldset>
  )
}
