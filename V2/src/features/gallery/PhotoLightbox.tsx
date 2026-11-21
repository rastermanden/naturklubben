import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AppErrorBoundary } from '../../components/AppErrorBoundary'
import { EventPicker } from './EventPicker'
import { galleryErrorMessage } from './galleryErrors'
import {
  canRetryOptimization,
  optimizationStatusLabel,
} from './optimizationStatus'
import { PhotoComments } from './PhotoComments'
import type { Photo } from './types'

/**
 * Lysbordet: ét billede i fuld størrelse, bladring, redigering, status,
 * sletning og kommentarer. Porteret fra `src/features/gallery/PhotoLightbox.tsx`.
 *
 * Lysbordet bruger med vilje ikke tema-variablerne: det ligger på en mørk
 * baggrund, fordi et billede skal ses mod noget neutralt. Hvide knapper og lys
 * tekst er derfor rigtige i begge temaer.
 *
 * Rediger-, slet- og "prøv igen"-knapperne styres af felter, serveren har sat
 * (`canEdit`, `canDelete`, `isUploader`), ikke af klientens eget gæt.
 */
const SWIPE_THRESHOLD_PX = 50
const MAX_CAPTION_LENGTH = 500

interface PhotoLightboxProps {
  photo: Photo
  albumTitle?: string | null
  onClose: () => void
  onEdit?: (
    photo: Photo,
    changes: { caption: string | null; eventId: string | null },
  ) => Promise<void>
  onDelete: (photo: Photo) => void
  onRevoke?: (photo: Photo) => void
  onRetryOptimization: (photo: Photo) => void
  deleting: boolean
  revoking?: boolean
  retrying: boolean
  actionError: string | null
  onPrevious?: (() => void) | null
  onNext?: (() => void) | null
  positionLabel?: string | null
}

export function PhotoLightbox({
  photo,
  albumTitle = null,
  onClose,
  onEdit,
  onDelete,
  onRevoke,
  onRetryOptimization,
  deleting,
  revoking = false,
  retrying,
  actionError,
  onPrevious = null,
  onNext = null,
  positionLabel = null,
}: PhotoLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const captionInputRef = useRef<HTMLInputElement>(null)
  const prevEditingPhotoRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const saveRequestIdRef = useRef(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)

  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [captionDraft, setCaptionDraft] = useState('')
  const [eventDraft, setEventDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [saveNotice, setSaveNotice] = useState<{
    photoId: string
    message: string
  } | null>(null)

  const editing =
    editingPhotoId === photo.id && photo.canEdit && onEdit !== undefined
  const visibleSaveNotice =
    !editing && saveNotice?.photoId === photo.id ? saveNotice.message : null
  const statusLabel = optimizationStatusLabel(photo)
  const canRetry = canRetryOptimization(photo)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (editing) {
      prevEditingPhotoRef.current = photo.id
      captionInputRef.current?.focus()
      return
    }
    if (prevEditingPhotoRef.current === photo.id) {
      prevEditingPhotoRef.current = null
      editButtonRef.current?.focus()
    } else {
      prevEditingPhotoRef.current = null
    }
  }, [editing, photo.id])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (savingEdit) return
        if (editing) {
          setEditingPhotoId(null)
          setEditError(null)
        } else {
          onClose()
        }
        return
      }
      if (editing) return
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
  }, [editing, onClose, onNext, onPrevious, savingEdit])

  function openEdit() {
    if (savingEdit) return
    setCaptionDraft(photo.caption ?? '')
    setEventDraft(photo.eventId ?? '')
    setEditError(null)
    setSaveNotice(null)
    setEditingPhotoId(photo.id)
  }

  function cancelEdit() {
    if (savingEdit) return
    setEditingPhotoId(null)
    setEditError(null)
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onEdit || savingEdit) return
    const requestId = ++saveRequestIdRef.current
    const targetPhotoId = photo.id
    setEditError(null)
    setSaveNotice(null)
    setSavingEdit(true)
    try {
      await onEdit(photo, {
        caption: captionDraft.trim() || null,
        eventId: eventDraft.trim() || null,
      })
      if (!mountedRef.current || saveRequestIdRef.current !== requestId) return
      setEditingPhotoId(null)
      setSaveNotice({
        photoId: targetPhotoId,
        message: 'Ændringerne er gemt.',
      })
    } catch (error) {
      if (!mountedRef.current || saveRequestIdRef.current !== requestId) return
      setEditError(
        galleryErrorMessage(error, 'Billedet kunne ikke gemmes. Prøv igen.'),
      )
    } finally {
      if (mountedRef.current && saveRequestIdRef.current === requestId) {
        setSavingEdit(false)
      }
    }
  }

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
        if (event.target === event.currentTarget) {
          if (savingEdit) return
          if (editing) {
            cancelEdit()
            return
          }
          onClose()
        }
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
        if (editing) return
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-start gap-4 overflow-y-auto bg-black/90 px-4 pt-14 pb-8 sm:justify-center sm:pt-4"
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

      {(onPrevious || onNext) && !editing && (
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
          className={`${
            editing ? 'max-h-[40vh]' : 'max-h-[70vh]'
          } max-w-full rounded object-contain`}
        />
      )}

      {!editing && photo.caption && (
        <p className="max-w-prose text-center text-white">{photo.caption}</p>
      )}

      {!editing && albumTitle && (
        <p className="text-sm text-white/75">I albummet {albumTitle}</p>
      )}

      {visibleSaveNotice && (
        <p role="status" aria-live="polite" className="text-sm text-green-200">
          {visibleSaveNotice}
        </p>
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
      {actionError && !editing && (
        <p role="alert" className="text-sm text-red-200">
          {actionError}
        </p>
      )}

      {editing && (
        <form
          onSubmit={(event) => void handleSaveEdit(event)}
          onClick={(event) => event.stopPropagation()}
          aria-label="Redigér billede"
          className="flex w-full max-w-prose flex-col gap-3 rounded-lg border border-white/25 bg-black/70 p-4 text-left text-white"
        >
          <label className="flex flex-col gap-1 text-sm text-white">
            Billedtekst
            <input
              ref={captionInputRef}
              type="text"
              value={captionDraft}
              disabled={savingEdit}
              maxLength={MAX_CAPTION_LENGTH}
              onChange={(event) => setCaptionDraft(event.target.value)}
              className="min-h-11 rounded border border-white/40 bg-surface px-3 py-2 text-base text-ink disabled:opacity-60"
            />
          </label>

          <AppErrorBoundary
            fallback={(retry) => (
              <p role="alert" className="text-sm text-red-200">
                Listen over begivenheder kunne ikke hentes. Du kan stadig rette
                billedteksten.{' '}
                <button
                  type="button"
                  onClick={retry}
                  className="min-h-11 underline"
                >
                  Prøv igen
                </button>
              </p>
            )}
          >
            <EventPicker
              value={eventDraft}
              valueTitle={albumTitle ?? undefined}
              onChange={setEventDraft}
              label="Begivenhed"
              emptyLabel="Ingen begivenhed"
              hideWhenEmpty={false}
              tone="inverse"
              disabled={savingEdit}
            />
          </AppErrorBoundary>

          {editError && (
            <p role="alert" className="text-sm text-red-200">
              {editError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingEdit}
              className="min-h-11 rounded bg-white px-4 py-2 font-medium text-green-900 disabled:opacity-60"
            >
              {savingEdit ? 'Gemmer…' : 'Gem'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={savingEdit}
              className="min-h-11 rounded border border-white/50 px-4 py-2 text-white disabled:opacity-60"
            >
              Annullér
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {photo.canEdit && onEdit && (
            <button
              ref={editButtonRef}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                openEdit()
              }}
              className="min-h-11 rounded bg-white px-4 py-2 text-green-900"
            >
              Redigér
            </button>
          )}
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
          {photo.canDelete && onRevoke && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRevoke(photo)
              }}
              disabled={revoking}
              className="min-h-11 rounded bg-white px-4 py-2 text-ink disabled:opacity-60"
            >
              {revoking ? 'Trækker tilbage…' : 'Træk link tilbage'}
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
      )}

      <PhotoComments photoId={photo.id} />
    </div>
  )
}
