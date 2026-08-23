import { describe, expect, it } from 'vitest'
import {
  filterPhotosByEvent,
  updateGallerySearchParam,
  WITHOUT_EVENT_FILTER,
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
  it('preserves unrelated and photo params when changing the event filter', () => {
    const current = new URLSearchParams(
      'photo=photo-1&event=old-event&campaign=summer',
    )

    expect(
      updateGallerySearchParam(current, 'event', 'new-event').toString(),
    ).toBe('photo=photo-1&event=new-event&campaign=summer')
    expect(current.get('event')).toBe('old-event')
  })

  it('removes only the requested parameter', () => {
    const current = new URLSearchParams('photo=photo-1&event=event-1')

    expect(updateGallerySearchParam(current, 'photo', null).toString()).toBe(
      'event=event-1',
    )
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
      filterPhotosByEvent(photos, WITHOUT_EVENT_FILTER).map(({ id }) => id),
    ).toEqual(['photo-3'])
    expect(filterPhotosByEvent(photos, null)).toBe(photos)
  })
})
