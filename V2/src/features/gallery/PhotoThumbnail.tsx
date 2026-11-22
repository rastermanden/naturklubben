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
  selection,
}: {
  photo: Photo
  onClick: () => void
  selection?: {
    selected: boolean
    disabled: boolean
    disabledReason?: 'not-owner' | 'busy'
  }
}) {
  const caption = photo.caption?.trim()
  const isVideo = photo.mediaKind === 'video'
  const mediaNoun = isVideo ? 'video' : 'billede'
  const statusLabel = optimizationStatusLabel(photo)
  const notOwned =
    selection?.disabled === true && selection.disabledReason !== 'busy'
  const accessibleName = selection
    ? notOwned
      ? caption
        ? `Andet medlems ${mediaNoun}, kan ikke vælges: ${caption}`
        : `Andet medlems ${mediaNoun} uden billedtekst, kan ikke vælges`
      : selection.selected
        ? caption
          ? `Fravælg ${mediaNoun}: ${caption}`
          : `Fravælg ${mediaNoun} uden billedtekst`
        : caption
          ? `Vælg ${mediaNoun}: ${caption}`
          : `Vælg ${mediaNoun} uden billedtekst`
    : caption
      ? `Åbn ${mediaNoun}: ${caption}`
      : `Åbn ${mediaNoun} uden billedtekst`

  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-pressed={selection ? selection.selected : undefined}
      disabled={selection?.disabled}
      onClick={onClick}
      className={`relative aspect-square overflow-hidden rounded bg-surface-sunken ${
        selection?.selected ? 'ring-3 ring-accent ring-offset-2' : ''
      } ${
        notOwned
          ? 'cursor-not-allowed opacity-45'
          : selection?.disabled
            ? 'cursor-not-allowed opacity-70'
            : ''
      }`}
    >
      {photo.thumbnailUrl === null && !isVideo && (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-danger">
          Billedet kunne ikke hentes
        </span>
      )}
      {photo.thumbnailUrl === null && isVideo && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface-sunken p-2 text-ink-body">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-ink shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="text-xs font-medium text-ink-muted">Video</span>
        </span>
      )}
      {photo.thumbnailUrl !== null && (
        <>
          <img
            src={photo.thumbnailUrl}
            alt={caption ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          {isVideo && (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white"
              >
                Video
              </span>
            </>
          )}
        </>
      )}
      {selection && !notOwned && (
        <span
          aria-hidden="true"
          className={`absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ${
            selection.selected
              ? 'border-white bg-accent text-white'
              : 'border-white bg-black/50 text-transparent'
          }`}
        >
          ✓
        </span>
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
