import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Til/fra for nyhedsnotifikationer. Valget gælder alle medlemmets enheder,
 * ligesom de øvrige notifikationsvalg: slår man det fra på telefonen, skal
 * computeren også tie.
 *
 * Filtreringen sker på serveren, når nyheden sendes -- ikke her. En klient kan
 * ikke undlade at modtage en notifikation, den allerede har fået.
 */
export function FeatureNotificationPreference() {
  const enabled = useQuery(api.announcements.pushEnabled)
  const setPushEnabled = useMutation(api.announcements.setPushEnabled)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  if (enabled === undefined) return null

  async function toggle(next: boolean) {
    setSaving(true)
    setFailed(false)
    try {
      await setPushEnabled({ enabled: next })
    } catch (caught) {
      console.error('Kunne ikke gemme nyhedsvalget', caught)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="feature-notifications-enabled"
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(event) => void toggle(event.target.checked)}
          className="h-5 w-5 rounded border-line-strong text-ink-muted disabled:opacity-50"
        />
        <label
          htmlFor="feature-notifications-enabled"
          className="text-sm text-ink-body"
        >
          Send mig også nyhederne som en notifikation
        </label>
        {saving && (
          <span role="status" className="text-sm text-ink-subtle">
            Gemmer…
          </span>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Valget kunne ikke gemmes. Prøv igen.
        </p>
      )}
    </div>
  )
}
