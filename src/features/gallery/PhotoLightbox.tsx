import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useDisplayUrl } from './useDisplayUrl'
import { useAuth } from '../auth/useAuth'
import {
  canRetryOptimization,
  optimizationStatusLabel,
} from './optimizationStatus'
import type { Photo } from './types'

interface PhotoLightboxProps {
  photo: Photo
  onClose: () => void
  onDelete: (photo: Photo) => void
  onRetryOptimization: (photo: Photo) => void
  deleting: boolean
  retrying: boolean
  actionError: string | null
}

export function PhotoLightbox({
  photo,
  onClose,
  onDelete,
  onRetryOptimization,
  deleting,
  retrying,
  actionError,
}: PhotoLightboxProps) {
  const { url, isLoading, error, refetch } = useDisplayUrl(photo, 'full')
  const { session } = useAuth()
  const isOwner = session?.user.id === photo.uploaded_by
  const canRetry = canRetryOptimization(photo, session?.user.id)
  const statusLabel = optimizationStatusLabel(photo)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  })

  useEffect(() => {
    if (!shareStatus) return
    const timeout = window.setTimeout(() => setShareStatus(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [shareStatus])

  async function handleShareClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setShareStatus(null)

    try {
      const shareUrl = new URL(window.location.href)
      shareUrl.hash = ''
      shareUrl.searchParams.set('photo', photo.id)
      const shareLink = shareUrl.toString()
      if (navigator.share) {
        await navigator.share({
          title: photo.caption ?? 'Billede fra Naturklubben',
          url: shareLink,
        })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
        setShareStatus('Link kopieret.')
        return
      }
      setShareStatus(`Kopiér link manuelt: ${shareLink}`)
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareStatus('Kunne ikke dele link. Prøv igen.')
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption ?? 'Billede'}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={handleShareClick}
        className="absolute top-4 left-4 z-10 min-h-11 rounded border border-white px-4 py-2 text-white"
      >
        Del link
      </button>

      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Luk"
        className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded text-2xl text-white"
      >
        ×
      </button>

      {isLoading && <p className="text-white">Henter billede…</p>}
      {error && (
        <div role="alert" className="text-center text-white">
          <p>Billedet kunne ikke hentes.</p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void refetch()
            }}
            className="mt-2 min-h-11 underline"
          >
            Prøv igen
          </button>
        </div>
      )}
      {url && !error && (
        <img
          src={url}
          alt={photo.caption ?? ''}
          onClick={(event) => event.stopPropagation()}
          className="max-h-[75vh] max-w-full rounded object-contain"
        />
      )}

      {(photo.caption || photo.event) && (
        <div className="max-w-prose text-center text-white">
          {photo.caption && <p>{photo.caption}</p>}
          {photo.event && (
            <p className="text-sm text-white/70">{photo.event.title}</p>
          )}
        </div>
      )}

      {statusLabel && (
        <p role="status" aria-live="polite" className="text-sm text-white/80">
          {statusLabel}
          {photo.optimization_status === 'failed' &&
            photo.optimization_error &&
            ` — ${photo.optimization_error}`}
          {photo.optimization_status === 'delete_failed' &&
            photo.optimization_error &&
            ` — ${photo.optimization_error}`}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-red-200">
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {canRetry && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRetryOptimization(photo)
            }}
            disabled={retrying}
            className="min-h-11 rounded bg-white px-4 py-2 text-green-900 disabled:opacity-60"
          >
            {retrying ? 'Starter igen…' : 'Prøv optimering igen'}
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(photo)
            }}
            disabled={deleting}
            className="min-h-11 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-60"
          >
            {deleting
              ? 'Sletter…'
              : photo.optimization_status === 'deleting' ||
                  photo.optimization_status === 'delete_failed'
                ? 'Prøv sletning igen'
                : 'Slet billede'}
          </button>
        )}
      </div>
      <p
        role="status"
        aria-live="polite"
        onClick={(event) => event.stopPropagation()}
        className="min-h-[1.25rem] text-sm text-white/80"
      >
        {shareStatus ?? ''}
      </p>
    </div>
  )
}
