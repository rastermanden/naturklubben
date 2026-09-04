import { useDisplayUrl } from './useDisplayUrl'
import { optimizationStatusLabel } from './optimizationStatus'
import type { Photo } from './types'

export function PhotoThumbnail({
  photo,
  onClick,
}: {
  photo: Photo
  onClick: () => void
}) {
  const { url, isLoading, error, refetch } = useDisplayUrl(photo, 'thumbnail')
  const statusLabel = optimizationStatusLabel(photo)
  const caption = photo.caption?.trim()
  const accessibleName = error
    ? caption
      ? `Prøv at hente billedet "${caption}" igen`
      : 'Prøv at hente billede uden billedtekst igen'
    : caption
      ? `Åbn billede: ${caption}`
      : 'Åbn billede uden billedtekst'

  return (
    <button
      type="button"
      aria-label={accessibleName}
      onClick={() => {
        if (error) {
          void refetch()
        } else {
          onClick()
        }
      }}
      className="relative aspect-square overflow-hidden rounded bg-surface-sunken"
    >
      {isLoading && (
        <span className="absolute inset-0 animate-pulse bg-surface-raised" />
      )}
      {url && !error && (
        <img
          src={url}
          alt={caption ?? ''}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      {error && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger-surface p-2 text-xs text-danger-strong">
          Billedet kunne ikke hentes
          <span className="underline">Prøv igen</span>
        </span>
      )}
      {statusLabel && (
        <span
          className={`absolute right-1 bottom-1 rounded px-1.5 py-0.5 text-xs text-white ${
            photo.optimization_status === 'failed' ||
            photo.optimization_status === 'delete_failed'
              ? 'bg-danger-solid/90'
              : 'bg-black/70'
          }`}
        >
          {statusLabel}
        </span>
      )}
    </button>
  )
}
