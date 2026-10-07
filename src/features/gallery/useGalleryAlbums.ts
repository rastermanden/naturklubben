import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { WITHOUT_EVENT_ALBUM } from './gallerySearchParams'

export const galleryAlbumsQueryKey = ['gallery-albums'] as const

export interface GalleryAlbumCover {
  photoId: string
  thumbnailPath: string | null
  optimizedPath: string | null
  storagePath: string
}

export interface GalleryAlbum {
  /** Stabilt album-id til brug i URL'en og som React-key. Aldrig null -- se
   *  WITHOUT_EVENT_ALBUM for albummet uden begivenhed. */
  albumId: string
  /** Den bagvedliggende begivenheds id, eller null for "Uden begivenhed". */
  eventId: string | null
  title: string
  eventDate: string | null
  photoCount: number
  cover: GalleryAlbumCover | null
}

interface GalleryAlbumRow {
  event_id: string | null
  title: string | null
  start_at: string | null
  photo_count: number
  latest_photo_at: string
  cover_photo_id: string | null
  cover_thumbnail_path: string | null
  cover_optimized_path: string | null
  cover_storage_path: string | null
}

function toAlbum(row: GalleryAlbumRow): GalleryAlbum {
  return {
    albumId: row.event_id ?? WITHOUT_EVENT_ALBUM,
    eventId: row.event_id,
    title: row.event_id
      ? (row.title ?? 'Ukendt begivenhed')
      : 'Uden begivenhed',
    eventDate: row.event_id ? row.start_at : null,
    photoCount: row.photo_count,
    cover:
      row.cover_photo_id && row.cover_storage_path
        ? {
            photoId: row.cover_photo_id,
            thumbnailPath: row.cover_thumbnail_path,
            optimizedPath: row.cover_optimized_path,
            storagePath: row.cover_storage_path,
          }
        : null,
  }
}

/**
 * Album med en begivenhed vises nyeste tur først; "Uden begivenhed" har ingen
 * dato at sortere efter og står derfor altid sidst.
 */
export function sortGalleryAlbums(albums: GalleryAlbum[]): GalleryAlbum[] {
  const withEvent = albums.filter((album) => album.eventId !== null)
  const withoutEvent = albums.filter((album) => album.eventId === null)
  withEvent.sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))
  return [...withEvent, ...withoutEvent]
}

async function fetchGalleryAlbums(): Promise<GalleryAlbum[]> {
  const { data, error } = await supabase
    .from('gallery_albums')
    .select(
      'event_id, title, start_at, photo_count, latest_photo_at, cover_photo_id, cover_thumbnail_path, cover_optimized_path, cover_storage_path',
    )

  if (error) throw error
  return sortGalleryAlbums((data as GalleryAlbumRow[]).map(toAlbum))
}

/**
 * Album-forsiden (#218): ét album pr. begivenhed, plus "Uden begivenhed".
 * Realtime kommer via en let invalidering, når `photos` ændrer sig -- viewet
 * er billigt at genberegne, og et nyt/flyttet/slettet billede kan ændre både
 * cover og antal.
 */
export function useGalleryAlbums() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: galleryAlbumsQueryKey,
    queryFn: fetchGalleryAlbums,
    staleTime: 10_000,
  })

  useEffect(() => {
    const channel = supabase
      .channel('gallery-albums-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        () => {
          void queryClient.invalidateQueries({
            queryKey: galleryAlbumsQueryKey,
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}
