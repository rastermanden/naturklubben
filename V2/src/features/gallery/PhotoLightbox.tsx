import { useEffect, useRef } from 'react'
import {
  canRetryOptimization,
  optimizationStatusLabel,
} from './optimizationStatus'
import { PhotoComments } from './PhotoComments'
import type { Photo } from './types'

/**
 * Lysbordet: ét billede i fuld størrelse, bladring, status, sletning og
 * kommentarer. Porteret fra `src/features/gallery/PhotoLightbox.tsx`.
 *
 * Lysbordet bruger med vilje ikke tema-variablerne: det ligger på en mørk
 * baggrund, fordi et billede skal ses mod noget neutralt. Hvide knapper og lys
 * tekst er derfor rigtige i begge temaer.
 *
 * Slet- og "prøv igen"-knapperne styres af felter, serveren har sat
 * (`canDelete`, `isUploader`), ikke af klientens eget gæt.
 */
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
}: PhotoLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)
  const statusLabel = optimizationStatusLabel(photo)
  const canRetry = canRetryOptimization(photo)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
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
  }, [onClose, onNext, onPrevious])

  return (
    <div
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
      onTouchStart={(event) => {
        swipedRef.current = false
        const touch = event.touches[0]
        touchStartRef.current = touch
          ? { x: touch.clientX, y: touch.clientY }
          : null
      }}
      onTouchEnd={(event) => {
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
        // Et swipe udløser også et klik bagefter; uden flaget ville
        // lysbordet lukke i samme bevægelse, som bladrede videre.
        swipedRef.current = true
        browse()
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/90 p-4"
    >
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Luk"
          className="flex h-11 w-11 items-center justify-center rounded text-2xl text-white"
        >
          ×
        </button>
      </div>

      {(onPrevious || onNext) && (
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
            aria-label="Næste billede"
            className="absolute top-1/2 right-2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl text-white disabled:opacity-30"
          >
            <span aria-hidden="true">›</span>
          </button>
        </>
      )}

      {photo.displayUrl === null && (
        <p role="alert" className="text-white">
          Billedet kunne ikke hentes.
        </p>
      )}
      {photo.displayUrl !== null && (
        <img
          src={photo.displayUrl}
          alt={photo.caption ?? ''}
          onClick={(event) => event.stopPropagation()}
          className="max-h-[70vh] max-w-full rounded object-contain"
        />
      )}

      {photo.caption && (
        <p className="max-w-prose text-center text-white">{photo.caption}</p>
      )}

      {positionLabel && (
        <p role="status" aria-live="polite" className="text-sm text-white/70">
          {positionLabel}
        </p>
      )}

      {statusLabel && (
        <p role="status" aria-live="polite" className="text-sm text-white/80">
          {statusLabel}
          {photo.optimizationStatus === 'failed' && photo.optimizationError
            ? ` — ${photo.optimizationError}`
            : ''}
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
        {photo.canDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(photo)
            }}
            disabled={deleting}
            className="min-h-11 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-60"
          >
            {deleting ? 'Sletter…' : 'Slet billede'}
          </button>
        )}
      </div>

      <PhotoComments photoId={photo.id} />
    </div>
  )
}
