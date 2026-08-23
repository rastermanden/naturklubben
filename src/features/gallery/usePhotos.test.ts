import { describe, expect, it, vi } from 'vitest'
import type { InfiniteData } from '@tanstack/react-query'
import {
  mergePhotoPages,
  PHOTO_OPTIMIZATION_POLL_LIMIT,
  photoIdsToPoll,
  removePhotoFromHistory,
  STALE_OPTIMIZATION_MS,
  upsertPhotoInHistory,
  type PhotoPage,
} from './usePhotos'
import type { Photo } from './types'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

function photo(id: string, createdAt: string): Photo {
  return {
    id,
    storage_path: `${id}.jpg`,
    optimized_path: `${id}-optimized.jpg`,
    thumbnail_path: `${id}-thumbnail.jpg`,
    caption: id,
    event_id: null,
    event: null,
    uploaded_by: 'member-1',
    created_at: createdAt,
    optimization_status: 'ready',
    optimization_attempts: 1,
    optimization_started_at: null,
    optimization_completed_at: createdAt,
    optimization_error: null,
  }
}

const newest = photo('photo-c', '2026-08-23T12:00:00.000Z')
const sameTimeLowerId = photo('photo-b', newest.created_at)
const oldest = photo('photo-a', '2026-08-23T11:00:00.000Z')

function history(pages: PhotoPage[]): InfiniteData<PhotoPage, unknown> {
  return {
    pages,
    pageParams: pages.map((_, index) => (index === 0 ? undefined : index)),
  }
}

describe('gallery keyset cache', () => {
  it('merges pages deterministically and removes boundary duplicates', () => {
    expect(
      mergePhotoPages([
        { photos: [sameTimeLowerId, newest], hasMore: true },
        { photos: [sameTimeLowerId, oldest], hasMore: false },
      ]),
    ).toEqual([newest, sameTimeLowerId, oldest])
  })

  it('inserts a realtime photo into the relevant page without changing cursors', () => {
    const current = history([
      { photos: [sameTimeLowerId], hasMore: true },
      { photos: [oldest], hasMore: false },
    ])
    const updated = upsertPhotoInHistory(current, newest)

    expect(updated?.pageParams).toBe(current.pageParams)
    expect(updated?.pages[0]?.photos).toEqual([newest, sameTimeLowerId])
    expect(updated?.pages[1]).toBe(current.pages[1])
  })

  it('updates all duplicate copies at a page boundary exactly once', () => {
    const changed = { ...sameTimeLowerId, caption: 'Opdateret' }
    const updated = upsertPhotoInHistory(
      history([
        { photos: [newest, sameTimeLowerId], hasMore: true },
        { photos: [sameTimeLowerId, oldest], hasMore: false },
      ]),
      changed,
    )

    expect(mergePhotoPages(updated?.pages ?? [])).toEqual([
      newest,
      changed,
      oldest,
    ])
    expect(
      updated?.pages
        .flatMap((page) => page.photos)
        .filter((item) => item.id === changed.id),
    ).toHaveLength(1)
  })

  it('ignores an insert beyond an unloaded cursor but appends at the known end', () => {
    const beyond = photo('photo-0', '2026-08-23T10:00:00.000Z')
    const incomplete = history([{ photos: [oldest], hasMore: true }])
    expect(upsertPhotoInHistory(incomplete, beyond)).toBe(incomplete)

    const complete = history([{ photos: [oldest], hasMore: false }])
    expect(upsertPhotoInHistory(complete, beyond)?.pages[0]?.photos).toEqual([
      oldest,
      beyond,
    ])
  })

  it('removes a deleted photo without rebuilding untouched pages', () => {
    const current = history([
      { photos: [newest], hasMore: true },
      { photos: [oldest], hasMore: false },
    ])
    const updated = removePhotoFromHistory(current, newest.id)

    expect(updated?.pages[0]?.photos).toEqual([])
    expect(updated?.pages[1]).toBe(current.pages[1])
    expect(updated?.pageParams).toBe(current.pageParams)
  })

  it('polls only active cached optimizations and caps the request size', () => {
    const now = Date.parse('2026-08-23T12:00:00.000Z')
    const active = Array.from(
      { length: PHOTO_OPTIMIZATION_POLL_LIMIT + 5 },
      (_, index) => ({
        ...photo(`processing-${index}`, newest.created_at),
        optimization_status: 'processing' as const,
        optimization_started_at: new Date(now - 1000).toISOString(),
      }),
    )
    const inactive = [
      oldest,
      {
        ...photo('stale', oldest.created_at),
        optimization_status: 'processing' as const,
        optimization_started_at: new Date(
          now - STALE_OPTIMIZATION_MS,
        ).toISOString(),
      },
    ]

    expect(photoIdsToPoll([...inactive, ...active], now)).toHaveLength(
      PHOTO_OPTIMIZATION_POLL_LIMIT,
    )
    expect(photoIdsToPoll(inactive, now)).toEqual([])
  })
})
