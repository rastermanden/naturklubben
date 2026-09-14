import { supabase } from '../../lib/supabaseClient'
import type { GalleryAlbum } from './useGalleryAlbums'

function formatAlbumDate(value: string) {
  return new Date(value).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function coverUrl(cover: GalleryAlbum['cover']): string | null {
  if (!cover) return null
  const path = cover.thumbnailPath ?? cover.optimizedPath
  if (!path) return null
  return supabase.storage.from('photos-optimized').getPublicUrl(path).data
    .publicUrl
}

function albumSubtitle(album: GalleryAlbum) {
  const countLabel =
    album.photoCount === 1 ? '1 billede' : `${album.photoCount} billeder`
  return album.eventDate
    ? `${countLabel} · ${formatAlbumDate(album.eventDate)}`
    : countLabel
}

export function GalleryAlbumGrid({
  albums,
  onOpenAlbum,
}: {
  albums: GalleryAlbum[]
  onOpenAlbum: (album: GalleryAlbum) => void
}) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      data-testid="gallery-album-grid"
    >
      {albums.map((album) => {
        const url = coverUrl(album.cover)
        return (
          <button
            key={album.albumId}
            type="button"
            onClick={() => onOpenAlbum(album)}
            aria-label={`Åbn album: ${album.title}, ${albumSubtitle(album)}`}
            className="flex flex-col gap-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="relative block aspect-square overflow-hidden rounded bg-surface-sunken">
              {url ? (
                <img
                  src={url}
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
        )
      })}
    </div>
  )
}
