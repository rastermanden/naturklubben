import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

import { sortGalleryAlbums, type GalleryAlbum } from './useGalleryAlbums'

function album(overrides: Partial<GalleryAlbum> = {}): GalleryAlbum {
  return {
    albumId: 'event-1',
    eventId: 'event-1',
    title: 'Skovtur',
    eventDate: '2026-08-20T12:00:00.000Z',
    photoCount: 1,
    cover: null,
    ...overrides,
  }
}

describe('sortGalleryAlbums', () => {
  it('sorts events with a date newest first', () => {
    const older = album({
      albumId: 'event-1',
      eventDate: '2026-08-01T12:00:00.000Z',
    })
    const newer = album({
      albumId: 'event-2',
      eventDate: '2026-08-20T12:00:00.000Z',
    })

    expect(sortGalleryAlbums([older, newer])).toEqual([newer, older])
  })

  it('always places the album without an event last', () => {
    const withEvent = album()
    const withoutEvent = album({
      albumId: 'without-event',
      eventId: null,
      title: 'Uden begivenhed',
      eventDate: null,
    })

    expect(sortGalleryAlbums([withoutEvent, withEvent])).toEqual([
      withEvent,
      withoutEvent,
    ])
  })
})
