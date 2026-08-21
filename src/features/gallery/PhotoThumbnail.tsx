import { useDisplayUrl } from './useDisplayUrl'
import type { Photo } from './types'

export function PhotoThumbnail({
  photo,
  onClick,
}: {
  photo: Photo
  onClick: () => void
}) {
  const { url, optimizing } = useDisplayUrl(photo, 'thumbnail')

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square overflow-hidden rounded bg-green-50"
    >
      {url && (
        <img
          src={url}
          alt={photo.caption ?? ''}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      {optimizing && (
        <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          optimerer…
        </span>
      )}
    </button>
  )
}
