import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { useIsAdmin } from '../admin/useIsAdmin'
import { formatRelativeTime } from '../chat/formatRelativeTime'
import {
  useCreatePhotoComment,
  useDeletePhotoComment,
  usePhotoComments,
  type PhotoComment,
} from './usePhotoComments'

const MAX_COMMENT_LENGTH = 1000

function authorName(comment: PhotoComment, isOwn: boolean) {
  if (comment.author?.full_name) return comment.author.full_name
  return isOwn ? 'Dig' : 'Medlem'
}

/**
 * Kommentarliste og -felt til lysbordet (#218). Følger chattens
 * skrivefelt-mønster: `aria-label` frem for synlig label, fejl i en
 * `role="alert"`, og listen som `role="log"`, så nye kommentarer annonceres
 * uden at genlæse hele listen.
 */
export function PhotoComments({ photoId }: { photoId: string }) {
  const { session } = useAuth()
  const { isAdmin } = useIsAdmin()
  const userId = session?.user.id
  const commentsQuery = usePhotoComments(photoId)
  const createComment = useCreatePhotoComment()
  const deleteComment = useDeletePhotoComment()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const comments = commentsQuery.data ?? []

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setError(null)
    createComment.mutate(
      { photoId, body },
      {
        onSuccess: () => setDraft(''),
        onError: () => setError('Kommentaren kunne ikke gemmes. Prøv igen.'),
      },
    )
  }

  function handleDelete(comment: PhotoComment) {
    setDeleteError(null)
    deleteComment.mutate(
      { commentId: comment.id, photoId },
      {
        onError: () =>
          setDeleteError('Kommentaren kunne ikke slettes. Prøv igen.'),
      },
    )
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="w-full max-w-prose text-left text-white"
    >
      <h2 className="mb-1 text-sm font-semibold text-white/90">Kommentarer</h2>

      {commentsQuery.isLoading && (
        <p role="status" className="text-sm text-white/70">
          Henter kommentarer…
        </p>
      )}
      {commentsQuery.isError && (
        <p role="alert" className="text-sm text-red-200">
          Kommentarerne kunne ikke hentes.
        </p>
      )}

      {commentsQuery.isSuccess && (
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
          {comments.map((comment) => {
            const isOwn = comment.user_id === userId
            const name = authorName(comment, isOwn)
            return (
              <li
                key={comment.id}
                className="flex items-start justify-between gap-2 rounded bg-white/10 px-3 py-2 text-sm"
              >
                <p className="min-w-0">
                  <span className="font-medium">{name}</span>{' '}
                  <span
                    title={new Date(comment.created_at).toLocaleString('da-DK')}
                    className="text-xs text-white/60"
                  >
                    {formatRelativeTime(comment.created_at)}
                  </span>
                  <span className="block break-words">{comment.body}</span>
                </p>
                {(isOwn || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment)}
                    disabled={
                      deleteComment.isPending &&
                      deleteComment.variables?.commentId === comment.id
                    }
                    aria-label={`Slet kommentar fra ${name}`}
                    className="min-h-11 shrink-0 rounded px-2 text-xs underline disabled:opacity-60"
                  >
                    Slet
                  </button>
                )}
              </li>
            )
          })}
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
          disabled={!draft.trim() || createComment.isPending}
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
