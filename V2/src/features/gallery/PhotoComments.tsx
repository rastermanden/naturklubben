import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { PhotoComment } from './types'

/**
 * Kommentarliste og -felt til lysbordet. Porteret fra
 * `src/features/gallery/PhotoComments.tsx`.
 *
 * Forskellen fra før: Realtime-kanalen er væk. `useQuery` *er* abonnementet i
 * Convex, så en ny kommentar dukker op af sig selv, når mutationen er gemt --
 * der er ingen `postgres_changes` at rydde op i.
 *
 * Hvem der må slette, afgør serveren (`deleteComment`), og svaret på
 * `listComments` bærer `canDelete`. Klienten gætter altså ikke på reglen.
 */

const MAX_COMMENT_LENGTH = 1000

function formatTime(createdAt: number) {
  return new Date(createdAt).toLocaleString('da-DK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PhotoComments({ photoId }: { photoId: string }) {
  const comments = useQuery(api.gallery.listComments, {
    photoId: photoId as Id<'photos'>,
  })
  const addComment = useMutation(api.gallery.addComment)
  const deleteComment = useMutation(api.gallery.deleteComment)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setError(null)
    void addComment({ photoId: photoId as Id<'photos'>, body })
      .then(() => setDraft(''))
      .catch(() => setError('Kommentaren kunne ikke gemmes. Prøv igen.'))
  }

  function handleDelete(comment: PhotoComment) {
    setDeleteError(null)
    void deleteComment({ commentId: comment.id as Id<'photoComments'> }).catch(
      () => setDeleteError('Kommentaren kunne ikke slettes. Prøv igen.'),
    )
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="w-full max-w-prose text-left text-white"
    >
      <h2 className="mb-1 text-sm font-semibold text-white/90">Kommentarer</h2>

      {comments === undefined && (
        <p role="status" className="text-sm text-white/70">
          Henter kommentarer…
        </p>
      )}

      {comments !== undefined && (
        <ul
          role="log"
          aria-label="Kommentarer"
          aria-live="polite"
          aria-relevant="additions"
          className="mb-2 flex max-h-40 flex-col gap-2 overflow-y-auto"
        >
          {comments.length === 0 && (
            <li className="text-sm text-white/70">Ingen kommentarer endnu.</li>
          )}
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex items-start justify-between gap-2 rounded bg-white/10 px-3 py-2 text-sm"
            >
              <p className="min-w-0">
                <span className="font-medium">{comment.authorName}</span>{' '}
                <span
                  title={new Date(comment.createdAt).toLocaleString('da-DK')}
                  className="text-xs text-white/60"
                >
                  {formatTime(comment.createdAt)}
                </span>
                <span className="block break-words">{comment.body}</span>
              </p>
              {comment.canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment)}
                  aria-label={`Slet kommentar fra ${comment.authorName}`}
                  className="min-h-11 shrink-0 rounded px-2 text-xs underline"
                >
                  Slet
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleteError && (
        <p role="alert" className="mb-2 text-sm text-red-200">
          {deleteError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label htmlFor="photo-comment-input" className="sr-only">
          Skriv en kommentar
        </label>
        <textarea
          id="photo-comment-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          rows={1}
          placeholder="Skriv en kommentar…"
          aria-label="Skriv en kommentar"
          className="min-h-11 flex-1 resize-none rounded-lg border border-white/40 bg-black/30 px-3 py-2 text-white placeholder:text-white/50"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="min-h-11 shrink-0 rounded-lg bg-white px-4 py-2 text-green-900 disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
