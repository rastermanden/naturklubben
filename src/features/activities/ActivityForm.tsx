import { useState, type FormEvent } from 'react'
import { ActivityIcon } from './ActivityIcon'
import { ACTIVITY_ICONS, normalizeActivityIcon } from './activityIcons'
import { toFriendlyActivityError } from './activityErrors'
import type { Activity } from './types'
import { useSaveActivity } from './useActivities'

interface ActivityFormProps {
  activity?: Activity
  /** Den nye aktivitet lægges nederst i listen. */
  nextSortOrder: number
  onDone: (message: string) => void
  onCancel: () => void
}

export function ActivityForm({
  activity,
  nextSortOrder,
  onDone,
  onCancel,
}: ActivityFormProps) {
  const saveActivity = useSaveActivity()

  const [title, setTitle] = useState(activity?.title ?? '')
  const [description, setDescription] = useState(activity?.description ?? '')
  const [icon, setIcon] = useState<string>(
    normalizeActivityIcon(activity?.icon ?? null),
  )
  const [linkUrl, setLinkUrl] = useState(activity?.link_url ?? '')
  const [linkLabel, setLinkLabel] = useState(activity?.link_label ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedUrl = linkUrl.trim()
    const trimmedLabel = linkLabel.trim()

    if (!trimmedTitle) {
      setError('Aktiviteten skal have en titel.')
      return
    }
    if (!trimmedDescription) {
      setError('Skriv en kort beskrivelse af aktiviteten.')
      return
    }
    // Databasen har samme regel som en constraint. Den fanges her først, så
    // admin får en sætning at rette efter frem for en afvist gemning.
    if (Boolean(trimmedUrl) !== Boolean(trimmedLabel)) {
      setError(
        'Et link skal have både en adresse og en linktekst -- eller ingen af delene.',
      )
      return
    }
    if (trimmedUrl && !/^https?:\/\/\S+$/.test(trimmedUrl)) {
      setError('Linkets adresse skal starte med http:// eller https://.')
      return
    }

    try {
      await saveActivity.mutateAsync({
        activityId: activity?.id,
        values: {
          title: trimmedTitle,
          description: trimmedDescription,
          icon,
          link_url: trimmedUrl || null,
          link_label: trimmedLabel || null,
        },
        nextSortOrder,
      })
      onDone(
        activity
          ? `${trimmedTitle} er opdateret.`
          : `${trimmedTitle} er tilføjet til aktiviteterne.`,
      )
    } catch (mutationError) {
      setError(toFriendlyActivityError(mutationError))
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface p-4"
    >
      <h3 className="font-medium text-ink-body">
        {activity ? `Ret ${activity.title}` : 'Ny aktivitet'}
      </h3>

      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Titel
        <input
          type="text"
          value={title}
          required
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Fx Hornfisk"
          className="rounded border border-line-strong px-3 py-2 text-base text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Beskrivelse
        <textarea
          value={description}
          required
          rows={3}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Hvad mødes I om?"
          className="rounded border border-line-strong px-3 py-2 text-base text-ink"
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Ikon
          <select
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            className="min-h-11 rounded border border-line-strong px-3 py-2 text-base text-ink"
          >
            {ACTIVITY_ICONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 pb-1">
          <ActivityIcon name={icon} size="sm" />
          <span className="text-xs text-ink-subtle">Sådan ser det ud</span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded border border-line p-3">
        <legend className="px-1 text-sm text-ink-body">
          Link (valgfrit -- udfyld begge felter eller ingen)
        </legend>
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Adresse
          <input
            type="url"
            value={linkUrl}
            maxLength={500}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://bral.dk"
            className="rounded border border-line-strong px-3 py-2 text-base text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Linktekst
          <input
            type="text"
            value={linkLabel}
            maxLength={120}
            onChange={(event) => setLinkLabel(event.target.value)}
            placeholder="Læs om valutaen på bral.dk"
            className="rounded border border-line-strong px-3 py-2 text-base text-ink"
          />
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saveActivity.isPending}
          className="min-h-11 rounded-lg bg-accent px-6 py-2 text-white disabled:opacity-50"
        >
          {saveActivity.isPending ? 'Gemmer…' : 'Gem aktivitet'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2 text-ink-muted"
        >
          Annullér
        </button>
      </div>
    </form>
  )
}
