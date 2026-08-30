import { describe, expect, it } from 'vitest'
import {
  PENDING_OPTIMIZATION_POLL_MS,
  pendingPhotosToOptimize,
} from './optimizationStatus'
import type { Photo } from './types'

const NOW = Date.parse('2026-08-23T12:00:00.000Z')

function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1',
    storage_path: 'member/photo-1.jpg',
    optimized_path: null,
    thumbnail_path: null,
    caption: null,
    event_id: null,
    event: null,
    uploaded_by: 'member',
    created_at: '2026-08-01T09:00:00.000Z',
    optimization_status: 'pending',
    optimization_attempts: 0,
    optimization_started_at: null,
    optimization_completed_at: null,
    optimization_error: null,
    ...overrides,
  }
}

const none = new Set<string>()

describe('pendingPhotosToOptimize', () => {
  it('picks up own photos left waiting for a first optimization', () => {
    expect(
      pendingPhotosToOptimize([photo()], 'member', none, NOW).map((p) => p.id),
    ).toEqual(['photo-1'])
  })

  it('leaves photos that are not the current user’s own', () => {
    expect(
      pendingPhotosToOptimize([photo()], 'someone-else', none, NOW),
    ).toEqual([])
    expect(pendingPhotosToOptimize([photo()], undefined, none, NOW)).toEqual([])
  })

  it('leaves statuses the client must not restart', () => {
    const others = (
      ['ready', 'failed', 'deleting', 'delete_failed'] as const
    ).map((optimization_status) => photo({ optimization_status }))

    expect(pendingPhotosToOptimize(others, 'member', none, NOW)).toEqual([])
  })

  it('picks up a photo stuck in a stale processing claim', () => {
    const stuck = photo({
      optimization_status: 'processing',
      optimization_started_at: new Date(NOW - 11 * 60 * 1000).toISOString(),
    })

    expect(
      pendingPhotosToOptimize([stuck], 'member', none, NOW).map((p) => p.id),
    ).toEqual(['photo-1'])
  })

  it('picks up a processing photo with no recorded start time', () => {
    const stuck = photo({
      optimization_status: 'processing',
      optimization_started_at: null,
    })

    expect(
      pendingPhotosToOptimize([stuck], 'member', none, NOW).map((p) => p.id),
    ).toEqual(['photo-1'])
  })

  it('leaves a photo that is still actively processing', () => {
    const active = photo({
      optimization_status: 'processing',
      optimization_started_at: new Date(NOW - 60 * 1000).toISOString(),
    })

    expect(pendingPhotosToOptimize([active], 'member', none, NOW)).toEqual([])
  })

  it('leaves a fresh upload to the queue that just requested it', () => {
    const justUploaded = photo({
      created_at: new Date(
        NOW - PENDING_OPTIMIZATION_POLL_MS / 2,
      ).toISOString(),
    })

    expect(
      pendingPhotosToOptimize([justUploaded], 'member', none, NOW),
    ).toEqual([])
  })

  it('asks for each photo only once', () => {
    expect(
      pendingPhotosToOptimize([photo()], 'member', new Set(['photo-1']), NOW),
    ).toEqual([])
  })
})
