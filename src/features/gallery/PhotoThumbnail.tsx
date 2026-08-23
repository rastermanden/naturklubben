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

  return (
    <button
      type="button"
      onClick={() => {
        if (error) {
          void refetch()
        } else {
          onClick()
        }
      }}
      className="relative aspect-square overflow-hidden rounded bg-green-50"
    >
      {isLoading && (
        <span className="absolute inset-0 animate-pulse bg-green-100" />
      )}
      {url && !error && (
        <img
          src={url}
          alt={photo.caption ?? ''}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      {error && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50 p-2 text-xs text-red-800">
          Billedet kunne ikke hentes
          <span className="underline">Prøv igen</span>
        </span>
      )}
      {statusLabel && (
        <span
          className={`absolute right-1 bottom-1 rounded px-1.5 py-0.5 text-xs text-white ${
            photo.optimization_status === 'failed' ||
            photo.optimization_status === 'delete_failed'
              ? 'bg-red-800/90'
              : 'bg-black/70'
          }`}
        >
          {statusLabel}
        </span>
      )}
    </button>
  )
}
