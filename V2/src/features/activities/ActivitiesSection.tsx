import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ActivityForm } from './ActivityForm'
import { ActivityIcon } from './ActivityIcon'
import { activityIconLabel } from './activityIcons'
import { reorderActivities } from './activityOrder'
import type { Activity } from './types'
import { useActivities } from './useActivities'

/**
 * Admin kan rette aktiviteterne, inklusive linket til bral.dk, uden en
 * migration. Teksterne er de samme som i den nuværende app.
 */
export function ActivitiesSection() {
  const activitiesQuery = useActivities()
  const deleteActivity = useMutation(api.calendar.deleteActivity)
  const reorder = useMutation(api.calendar.reorderActivities)
  const [editing, setEditing] = useState<Activity | 'new' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const activities = activitiesQuery ?? []

  function resetMessages() {
    setStatus(null)
    setError(null)
  }

  async function handleMove(activity: Activity, direction: 'up' | 'down') {
    resetMessages()
    const rows = reorderActivities(activities, activity.id, direction)
    if (rows.length === 0) return
    setBusy(true)
    try {
      await reorder({
        rows: rows.map((row) => ({
          activityId: row.activityId as Id<'activities'>,
          sortOrder: row.sortOrder,
        })),
      })
      setStatus(
        `${activity.title} er flyttet ${direction === 'up' ? 'op' : 'ned'}.`,
      )
    } catch {
      setError('Rækkefølgen kunne ikke gemmes. Prøv igen.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(activity: Activity) {
    if (
      !window.confirm(
        `Slet aktiviteten "${activity.title}"?\n\nDen forsvinder fra forsiden og aktivitetssiden med det samme. Handlingen kan ikke fortrydes.`,
      )
    ) {
      return
    }
    resetMessages()
    setBusy(true)
    try {
      await deleteActivity({ activityId: activity.id as Id<'activities'> })
      if (editing !== 'new' && editing?.id === activity.id) setEditing(null)
      setStatus(`${activity.title} er slettet.`)
    } catch {
      setError('Aktiviteten kunne ikke slettes. Prøv igen.')
    } finally {
      setBusy(false)
    }
  }

  const nextSortOrder =
    activities.reduce(
      (highest, activity) => Math.max(highest, activity.sortOrder),
      0,
    ) + 1

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-ink-body">
          Klubbens aktiviteter
          {activities.length > 0 && ` (${activities.length})`}
        </h2>
        {editing === null && (
          <button
            type="button"
            onClick={() => {
              resetMessages()
              setEditing('new')
            }}
            className="min-h-11 rounded-lg bg-accent px-4 py-2 text-white"
          >
            Ny aktivitet
          </button>
        )}
      </div>

      <p className="text-sm text-ink-subtle">
        Rækkefølgen her er den, aktiviteterne vises i -- forsiden viser de tre
        øverste.
      </p>

      {status && (
        <p role="status" className="text-sm text-ink-subtle">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {editing !== null && (
        <ActivityForm
          key={editing === 'new' ? 'new' : editing.id}
          activity={editing === 'new' ? undefined : editing}
          nextSortOrder={nextSortOrder}
          onDone={(message) => {
            setStatus(message)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {activitiesQuery === undefined && (
        <p className="text-sm text-ink-subtle">Henter aktiviteterne…</p>
      )}

      {activitiesQuery !== undefined && activities.length === 0 && (
        <p className="text-sm text-ink-subtle">
          Der er ingen aktiviteter endnu. Opret den første -- den vises med det
          samme på forsiden og aktivitetssiden.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {activities.map((activity, index) => (
          <li
            key={activity.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3"
          >
            <ActivityIcon name={activity.icon} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-ink">{activity.title}</p>
              <p className="truncate text-sm text-ink-subtle">
                {activity.description}
              </p>
              <p className="text-xs text-ink-subtle">
                Ikon: {activityIconLabel(activity.icon)}
                {activity.linkLabel && ` · Link: ${activity.linkLabel}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleMove(activity, 'up')}
                disabled={busy || index === 0}
                aria-label={`Flyt ${activity.title} op`}
                className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-muted disabled:opacity-50"
              >
                <span aria-hidden="true">&#8593;</span>
              </button>
              <button
                type="button"
                onClick={() => void handleMove(activity, 'down')}
                disabled={busy || index === activities.length - 1}
                aria-label={`Flyt ${activity.title} ned`}
                className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-muted disabled:opacity-50"
              >
                <span aria-hidden="true">&#8595;</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages()
                  setEditing(activity)
                }}
                className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-muted"
              >
                Ret
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(activity)}
                disabled={busy}
                className="min-h-11 rounded-lg border border-danger-line px-3 py-2 text-sm text-danger-strong disabled:opacity-50"
              >
                Slet
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
