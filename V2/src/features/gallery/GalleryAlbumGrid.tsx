import type { GalleryAlbum } from './types'

/**
 * Album-forsiden: ét kort pr. begivenhed, plus "Uden begivenhed".
 *
 * Coveret er det nyeste `ready`-billede i albummet -- serveren vedligeholder
 * det i `photoAlbums`, fordi Convex ikke kan gruppere og vælge det nyeste i en
 * query. Er intet billede klar endnu, står kortet uden billede i stedet for at
 * vise et halvfærdigt et.
 */
function albumSubtitle(album: GalleryAlbum) {
  const countLabel =
    album.photoCount === 1 ? '1 billede' : `${album.photoCount} billeder`
  if (album.latestPhotoAt === null) return countLabel
  const date = new Date(album.latestPhotoAt).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${countLabel} · senest ${date}`
}

export function GalleryAlbumGrid({
  albums,
  onOpenAlbum,
}: {
  albums: GalleryAlbum[]
  onOpenAlbum: (album: GalleryAlbum) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {albums.map((album) => (
        <button
          key={album.albumId}
          type="button"
          onClick={() => onOpenAlbum(album)}
          aria-label={`Åbn album: ${album.title}, ${albumSubtitle(album)}`}
          className="flex flex-col gap-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="relative block aspect-square overflow-hidden rounded bg-surface-sunken">
            {album.coverUrl ? (
              <img
                src={album.coverUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-ink-subtle">
                Intet billede klar endnu
              </span>
            )}
          </span>
          <span className="truncate font-medium text-ink-body">
            {album.title}
          </span>
          <span className="text-xs text-ink-subtle">
            {albumSubtitle(album)}
          </span>
        </button>
      ))}
    </div>
  )
}
