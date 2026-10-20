import { optimizationStatusLabel } from './optimizationStatus'
import type { Photo } from './types'

/**
 * Ét billede i gitteret. Viser den optimerede fil, hvis den findes -- ellers
 * originalen, som serveren sender URL'en til (se `photoView` i
 * `convex/gallery.ts`: V2 har ingen afledte filer endnu).
 */
export function PhotoThumbnail({
  photo,
  onClick,
}: {
  photo: Photo
  onClick: () => void
}) {
  const caption = photo.caption?.trim()
  const statusLabel = optimizationStatusLabel(photo)
  const accessibleName = caption
    ? `Åbn billede: ${caption}`
    : 'Åbn billede uden billedtekst'

  return (
    <button
      type="button"
      aria-label={accessibleName}
      onClick={onClick}
      className="relative aspect-square overflow-hidden rounded bg-surface-sunken"
    >
      {photo.thumbnailUrl === null && (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-danger">
          Billedet kunne ikke hentes
        </span>
      )}
      {photo.thumbnailUrl !== null && (
        <img
          src={photo.thumbnailUrl}
          alt={caption ?? ''}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      {statusLabel && (
        <span
          className={`absolute right-1 bottom-1 rounded px-1.5 py-0.5 text-xs text-white ${
            photo.optimizationStatus === 'failed'
              ? 'bg-danger-solid/90'
              : 'bg-black/70'
          }`}
        >
          {statusLabel}
        </span>
      )}
      {photo.commentCount > 0 && (
        <span
          aria-label={
            photo.commentCount === 1
              ? '1 kommentar'
              : `${photo.commentCount} kommentarer`
          }
          className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 4h16v12H7l-3 3V4z" />
          </svg>
          {photo.commentCount}
        </span>
      )}
    </button>
  )
}
