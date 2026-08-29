import { useState } from 'react'
import { ActivityForm } from './ActivityForm'
import { ActivityIcon } from './ActivityIcon'
import { activityIconLabel } from './activityIcons'
import { toFriendlyActivityError } from './activityErrors'
import { reorderActivities } from './activityOrder'
import type { Activity } from './types'
import {
  useActivities,
  useDeleteActivity,
  useReorderActivities,
} from './useActivities'

/**
 * Aktiviteterne på forsiden og aktivitetssiden var indtil nu kun redigerbare
 * via en migration. Her kan en admin rette teksten, skifte ikon, flytte
 * rækkefølgen og slette en aktivitet, uden at der skal skrives SQL.
 */
export function ActivitiesSection() {
  const activitiesQuery = useActivities()
  const deleteActivity = useDeleteActivity()
  const reorder = useReorderActivities()

  const [editing, setEditing] = useState<Activity | 'new' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activities = activitiesQuery.data ?? []

  function resetMessages() {
    setStatus(null)
    setError(null)
  }

  async function handleMove(activity: Activity, direction: 'up' | 'down') {
    resetMessages()
    const rows = reorderActivities(activities, activity.id, direction)
    if (rows.length === 0) return

    try {
      await reorder.mutateAsync(rows)
      setStatus(
        `${activity.title} er flyttet ${direction === 'up' ? 'op' : 'ned'}.`,
      )
    } catch (mutationError) {
      setError(toFriendlyActivityError(mutationError))
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
    try {
      await deleteActivity.mutateAsync(activity.id)
      if (editing !== 'new' && editing?.id === activity.id) setEditing(null)
      setStatus(`${activity.title} er slettet.`)
    } catch (mutationError) {
      setError(toFriendlyActivityError(mutationError))
    }
  }

  const busy = reorder.isPending || deleteActivity.isPending
  // En ny aktivitet lægges nederst. Højeste nummer + 1, ikke antallet: er der
  // huller i rækken (fx efter en sletning), ville antallet kunne ramme et
  // nummer, der allerede er i brug, og den nye ville lande midt i listen.
  const nextSortOrder =
    activities.reduce(
      (highest, activity) => Math.max(highest, activity.sort_order),
      0,
    ) + 1

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-green-900">
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
            className="min-h-11 rounded-lg bg-green-800 px-4 py-2 text-white"
          >
            Ny aktivitet
          </button>
        )}
      </div>

      <p className="text-sm text-green-700">
        Rækkefølgen her er den, aktiviteterne vises i -- forsiden viser de tre
        øverste.
      </p>

      {status && (
        <p role="status" className="text-sm text-green-700">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {editing !== null && (
        <ActivityForm
          // Uden nøglen ville et klik på "Ret" ved en anden aktivitet genbruge
          // den åbne formulars felter -- og dermed gemme den forrige
          // aktivitets tekst oven i den, admin lige valgte.
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

      {activitiesQuery.isPending && (
        <p className="text-sm text-green-700">Henter aktiviteterne…</p>
      )}

      {activitiesQuery.isError && (
        <p role="alert" className="text-sm text-red-700">
          Aktiviteterne kunne ikke hentes:{' '}
          {toFriendlyActivityError(activitiesQuery.error)}
        </p>
      )}

      {activitiesQuery.isSuccess && activities.length === 0 && (
        <p className="text-sm text-green-700">
          Der er ingen aktiviteter endnu. Opret den første -- den vises med det
          samme på forsiden og aktivitetssiden.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {activities.map((activity, index) => (
          <li
            key={activity.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 px-4 py-3"
          >
            <ActivityIcon name={activity.icon} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-green-950">{activity.title}</p>
              <p className="truncate text-sm text-green-700">
                {activity.description}
              </p>
              <p className="text-xs text-green-700">
                Ikon: {activityIconLabel(activity.icon)}
                {activity.link_label && ` · Link: ${activity.link_label}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleMove(activity, 'up')}
                disabled={busy || index === 0}
                aria-label={`Flyt ${activity.title} op`}
                className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800 disabled:opacity-50"
              >
                <span aria-hidden="true">&#8593;</span>
              </button>
              <button
                type="button"
                onClick={() => void handleMove(activity, 'down')}
                disabled={busy || index === activities.length - 1}
                aria-label={`Flyt ${activity.title} ned`}
                className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800 disabled:opacity-50"
              >
                <span aria-hidden="true">&#8595;</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages()
                  setEditing(activity)
                }}
                className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800"
              >
                Ret
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(activity)}
                disabled={busy}
                className="min-h-11 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-800 disabled:opacity-50"
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
