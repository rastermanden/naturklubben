import { useState, type FormEvent } from 'react'
import { useProfilesMap } from '../chat/useProfilesMap'
import { useEventTasks } from './useEventTasks'

export function EventTasksSection({
  eventId,
  userId,
}: {
  eventId: string
  userId: string
}) {
  const { tasksQuery, createTask, claimTask, releaseTask, deleteTask } =
    useEventTasks(eventId, userId)
  const profilesQuery = useProfilesMap()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const tasks = tasksQuery.data ?? []
  const mutationError =
    createTask.error ?? claimTask.error ?? releaseTask.error ?? deleteTask.error

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    const title = newTaskTitle.trim()
    if (!title) return
    createTask.mutate(title, { onSuccess: () => setNewTaskTitle('') })
  }

  return (
    <section className="mt-6 border-t border-green-200 pt-5">
      <h3 className="font-semibold text-green-900">
        Opgaver
        {!tasksQuery.isLoading && (
          <span className="ml-2 font-normal text-green-700">
            ({tasks.length})
          </span>
        )}
      </h3>

      {tasksQuery.isLoading && (
        <p role="status" className="mt-3 text-sm text-green-700">
          Henter opgaver…
        </p>
      )}

      {tasksQuery.isError && (
        <div
          role="alert"
          className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          Opgaverne kunne ikke hentes.
          <button
            type="button"
            onClick={() => tasksQuery.refetch()}
            className="ml-2 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {mutationError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Handlingen kunne ikke gennemføres. Prøv igen.
        </p>
      )}

      {tasksQuery.data && tasks.length === 0 && (
        <p className="mt-3 text-sm text-green-700">Ingen opgaver endnu.</p>
      )}

      {tasks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {tasks.map((task) => {
            const assigneeName = task.assigned_to
              ? (profilesQuery.data?.[task.assigned_to]?.full_name ?? 'Medlem')
              : null
            const isMine = task.assigned_to === userId
            const isCreator = task.created_by === userId
            const busy =
              (claimTask.isPending && claimTask.variables === task.id) ||
              (releaseTask.isPending && releaseTask.variables === task.id) ||
              (deleteTask.isPending && deleteTask.variables === task.id)

            return (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded bg-green-50 p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-green-950">{task.title}</p>
                  <p className="text-sm text-green-700">
                    {assigneeName
                      ? isMine
                        ? `${assigneeName} (dig)`
                        : assigneeName
                      : 'Ingen har meldt sig'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {task.assigned_to === null && (
                    <button
                      type="button"
                      onClick={() => claimTask.mutate(task.id)}
                      disabled={busy}
                      className="min-h-11 rounded border border-green-700 px-3 py-1 text-sm text-green-800 disabled:opacity-60"
                    >
                      Meld dig
                    </button>
                  )}
                  {isMine && (
                    <button
                      type="button"
                      onClick={() => releaseTask.mutate(task.id)}
                      disabled={busy}
                      className="min-h-11 rounded border border-green-700 px-3 py-1 text-sm text-green-800 disabled:opacity-60"
                    >
                      Træk dig
                    </button>
                  )}
                  {isCreator && (
                    <button
                      type="button"
                      onClick={() => deleteTask.mutate(task.id)}
                      disabled={busy}
                      className="min-h-11 rounded border border-red-700 px-3 py-1 text-sm text-red-700 disabled:opacity-60"
                    >
                      Slet
                    </button>
                  )}
                </div>
              </li>
            )
          })}
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
          className="min-h-11 flex-1 rounded border border-green-300 px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={createTask.isPending || newTaskTitle.trim() === ''}
          className="min-h-11 rounded bg-green-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {createTask.isPending ? 'Tilføjer…' : 'Tilføj'}
        </button>
      </form>
    </section>
  )
}
