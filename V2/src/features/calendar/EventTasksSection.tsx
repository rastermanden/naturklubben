import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { toFriendlyCalendarError } from './guestRequestErrors'
import { useEventTasks } from './useEventTasks'

/**
 * Opgavelisten på en begivenhed (#151).
 *
 * Reglerne er de samme som i den gamle app: alle medlemmer må oprette en opgave
 * og melde sig til en ledig, kun den, der har taget en opgave, kan trække sig,
 * og kun opretteren kan slette den. Backend håndhæver det; knapperne her viser
 * bare, hvad der er muligt.
 */
export function EventTasksSection({ eventId }: { eventId: Id<'events'> }) {
  const tasksQuery = useEventTasks(eventId)
  const createTask = useMutation(api.calendar.createTask)
  const claimTask = useMutation(api.calendar.claimTask)
  const releaseTask = useMutation(api.calendar.releaseTask)
  const deleteTask = useMutation(api.calendar.deleteTask)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tasks = tasksQuery ?? []

  async function run(action: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (cause) {
      setError(toFriendlyCalendarError(cause))
    } finally {
      setBusy(false)
    }
  }

  function handleCreate(formEvent: FormEvent) {
    formEvent.preventDefault()
    const title = newTaskTitle.trim()
    if (title === '') return
    void run(async () => {
      await createTask({ eventId, title })
      setNewTaskTitle('')
    })
  }

  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="font-semibold text-ink-body">
        Opgaver
        {tasksQuery !== undefined && (
          <span className="ml-2 font-normal text-ink-subtle">
            ({tasks.length})
          </span>
        )}
      </h3>

      {tasksQuery === undefined && (
        <p role="status" className="mt-3 text-sm text-ink-subtle">
          Henter opgaver…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {tasksQuery !== undefined && tasks.length === 0 && (
        <p className="mt-3 text-sm text-ink-subtle">Ingen opgaver endnu.</p>
      )}

      {tasks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-sunken p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">{task.title}</p>
                <p className="text-sm text-ink-subtle">
                  {task.assignedTo === null
                    ? 'Ingen har meldt sig'
                    : (task.assignedToName ?? 'Medlem')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {task.assignedTo === null && (
                  <button
                    type="button"
                    onClick={() => void run(() => claimTask({ taskId: task.id }))}
                    disabled={busy}
                    className="min-h-11 rounded border border-accent-soft px-3 py-1 text-sm text-ink-muted disabled:opacity-60"
                  >
                    Meld dig
                  </button>
                )}
                {task.assignedToMe && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(() => releaseTask({ taskId: task.id }))
                    }
                    disabled={busy}
                    className="min-h-11 rounded border border-accent-soft px-3 py-1 text-sm text-ink-muted disabled:opacity-60"
                  >
                    Træk dig
                  </button>
                )}
                {task.createdByMe && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(() => deleteTask({ taskId: task.id }))
                    }
                    disabled={busy}
                    className="min-h-11 rounded border border-danger-line-strong px-3 py-1 text-sm text-danger disabled:opacity-60"
                  >
                    Slet
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="new-event-task-title">
          Ny opgave
        </label>
        <input
          id="new-event-task-title"
          type="text"
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          placeholder="Ny opgave…"
          className="min-h-11 flex-1 rounded border border-line-strong px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={busy || newTaskTitle.trim() === ''}
          className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
        >
          Tilføj
        </button>
      </form>
    </section>
  )
}
