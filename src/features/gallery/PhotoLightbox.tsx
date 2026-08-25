import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useDisplayUrl } from './useDisplayUrl'
import { useAuth } from '../auth/useAuth'
import { useIsAdmin } from '../admin/useIsAdmin'
import {
  canRetryOptimization,
  optimizationStatusLabel,
} from './optimizationStatus'
import type { Photo } from './types'

// En vandret bevægelse skal være tydeligt vandret, før den tæller som et
// swipe — ellers bladrer galleriet, når man scroller eller trykker skævt.
const SWIPE_THRESHOLD_PX = 50

interface PhotoLightboxProps {
  photo: Photo
  onClose: () => void
  onDelete: (photo: Photo) => void
  onRetryOptimization: (photo: Photo) => void
  deleting: boolean
  retrying: boolean
  actionError: string | null
  onPrevious?: (() => void) | null
  onNext?: (() => void) | null
  positionLabel?: string | null
  loadingNext?: boolean
}

export function PhotoLightbox({
  photo,
  onClose,
  onDelete,
  onRetryOptimization,
  deleting,
  retrying,
  actionError,
  onPrevious = null,
  onNext = null,
  positionLabel = null,
  loadingNext = false,
}: PhotoLightboxProps) {
  const { url, isLoading, error, refetch } = useDisplayUrl(photo, 'full')
  const { session } = useAuth()
  const { isAdmin } = useIsAdmin()
  const isOwner = session?.user.id === photo.uploaded_by
  const canRetry = canRetryOptimization(photo, session?.user.id)
  const statusLabel = optimizationStatusLabel(photo)
  // Statusbeskeden hører til det billede, den blev vist for: lightboxen bliver
  // stående, mens man bladrer, så beskeden skal ikke følge med til det næste.
  const [shareStatus, setShareStatus] = useState<{
    photoId: string
    message: string
  } | null>(null)
  const visibleShareStatus =
    shareStatus?.photoId === photo.id ? shareStatus.message : null
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  })
  const canBrowse = Boolean(onPrevious || onNext || loadingNext)

  useEffect(() => {
    if (!shareStatus) return
    const timeout = window.setTimeout(() => setShareStatus(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [shareStatus])

  useEffect(() => {
    if (!onPrevious && !onNext) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      const browse = event.key === 'ArrowLeft' ? onPrevious : onNext
      if (!browse) return
      event.preventDefault()
      browse()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onNext, onPrevious])

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    swipedRef.current = false
    const touch = event.touches[0]
    touchStartRef.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return
    const browse = deltaX > 0 ? onPrevious : onNext
    if (!browse) return
    // Et swipe på baggrunden udløser også et klik bagefter; uden det her flag
    // ville lightboxen lukke i samme bevægelse, som bladrer videre.
    swipedRef.current = true
    browse()
  }

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
        setShareStatus({ photoId: photo.id, message: 'Link kopieret.' })
        return
      }
      setShareStatus({
        photoId: photo.id,
        message: `Kopiér link manuelt: ${shareLink}`,
      })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareStatus({
        photoId: photo.id,
        message: 'Kunne ikke dele link. Prøv igen.',
      })
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
        if (swipedRef.current) {
          swipedRef.current = false
          return
        }
        if (event.target === event.currentTarget) onClose()
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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

      {canBrowse && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onPrevious?.()
            }}
            disabled={!onPrevious}
            aria-label="Forrige billede"
            className="absolute top-1/2 left-2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl text-white disabled:opacity-30"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onNext?.()
            }}
            disabled={!onNext}
            aria-label={
              loadingNext ? 'Henter flere billeder…' : 'Næste billede'
            }
            className="absolute top-1/2 right-2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl text-white disabled:opacity-30"
          >
            <span aria-hidden="true">›</span>
          </button>
        </>
      )}

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

      {positionLabel && (
        <p role="status" aria-live="polite" className="text-sm text-white/70">
          {positionLabel}
        </p>
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
        {(isOwner || isAdmin) && (
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
        {visibleShareStatus ?? ''}
      </p>
    </div>
  )
}
