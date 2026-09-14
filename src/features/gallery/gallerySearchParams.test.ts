import { describe, expect, it } from 'vitest'
import {
  clearAlbumSearchParams,
  filterPhotosByEvent,
  updateGallerySearchParam,
  WITHOUT_EVENT_ALBUM,
} from './gallerySearchParams'
import type { Photo } from './types'

function photo(id: string, eventId: string | null): Photo {
  return {
    id,
    storage_path: `member/${id}.jpg`,
    optimized_path: `${id}.jpg`,
    thumbnail_path: `${id}-thumb.jpg`,
    caption: id,
    event_id: eventId,
    event: eventId ? { id: eventId, title: eventId } : null,
    uploaded_by: 'member',
    created_at: '2026-08-23T12:00:00.000Z',
    optimization_status: 'ready',
    optimization_attempts: 1,
    optimization_started_at: '2026-08-23T12:00:00.000Z',
    optimization_completed_at: '2026-08-23T12:01:00.000Z',
    optimization_error: null,
  }
}

describe('gallery search params', () => {
  it('preserves unrelated and photo params when changing the album', () => {
    const current = new URLSearchParams(
      'photo=photo-1&album=old-album&campaign=summer',
    )

    expect(
      updateGallerySearchParam(current, 'album', 'new-album').toString(),
    ).toBe('photo=photo-1&album=new-album&campaign=summer')
    expect(current.get('album')).toBe('old-album')
  })

  it('removes only the requested parameter', () => {
    const current = new URLSearchParams('photo=photo-1&album=album-1')

    expect(updateGallerySearchParam(current, 'photo', null).toString()).toBe(
      'album=album-1',
    )
  })

  it('clears both the album and photo params but keeps the rest', () => {
    const current = new URLSearchParams(
      'photo=photo-1&album=album-1&campaign=summer',
    )

    expect(clearAlbumSearchParams(current).toString()).toBe('campaign=summer')
  })

  it('filters by an event or missing event without changing the source list', () => {
    const photos = [
      photo('photo-1', 'event-1'),
      photo('photo-2', 'event-2'),
      photo('photo-3', null),
    ]

    expect(filterPhotosByEvent(photos, 'event-2').map(({ id }) => id)).toEqual([
      'photo-2',
    ])
    expect(
      filterPhotosByEvent(photos, WITHOUT_EVENT_ALBUM).map(({ id }) => id),
    ).toEqual(['photo-3'])
    expect(filterPhotosByEvent(photos, null)).toBe(photos)
  })
})
