import { useEffect, useState, type MouseEvent } from 'react'
import { useDisplayUrl } from './useDisplayUrl'
import { useAuth } from '../auth/useAuth'
import type { Photo } from './types'

interface PhotoLightboxProps {
  photo: Photo
  onClose: () => void
  onDelete: (photo: Photo) => void
  deleting: boolean
}

export function PhotoLightbox({
  photo,
  onClose,
  onDelete,
  deleting,
}: PhotoLightboxProps) {
  const { url } = useDisplayUrl(photo, 'full')
  const { session } = useAuth()
  const isOwner = session?.user.id === photo.uploaded_by
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption ?? 'Billede'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={handleShareClick}
        className="absolute top-4 left-4 min-h-11 rounded border border-white px-4 py-2 text-white"
      >
        Del link
      </button>

      <button
        type="button"
        onClick={onClose}
        aria-label="Luk"
        className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded text-2xl text-white"
      >
        ×
      </button>

      {url && (
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

      <div className="flex flex-wrap items-center justify-center gap-2">
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
            {deleting ? 'Sletter…' : 'Slet billede'}
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
