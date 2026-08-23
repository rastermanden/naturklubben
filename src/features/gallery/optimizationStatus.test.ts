import { describe, expect, it } from 'vitest'
import {
  canRetryOptimization,
  isPendingOptimizationActive,
  isStaleOptimization,
  optimizationStatusLabel,
  PENDING_OPTIMIZATION_POLL_MS,
  STALE_OPTIMIZATION_MS,
} from './optimizationStatus'
import type { Photo } from './types'

function photo(update: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1',
    storage_path: 'owner/photo-1.jpg',
    optimized_path: null,
    thumbnail_path: null,
    caption: null,
    event_id: null,
    event: null,
    uploaded_by: 'owner',
    created_at: '2026-08-23T12:00:00.000Z',
    optimization_status: 'processing',
    optimization_attempts: 1,
    optimization_started_at: '2026-08-23T12:00:00.000Z',
    optimization_completed_at: null,
    optimization_error: null,
    ...update,
  }
}

describe('gallery optimization status', () => {
  it('treats missing and old processing timestamps as stale', () => {
    const now = Date.parse('2026-08-23T12:20:00.000Z')

    expect(
      isStaleOptimization(photo({ optimization_started_at: null }), now),
    ).toBe(true)
    expect(
      isStaleOptimization(
        photo({
          optimization_started_at: new Date(
            now - STALE_OPTIMIZATION_MS - 1,
          ).toISOString(),
        }),
        now,
      ),
    ).toBe(true)
    expect(
      isStaleOptimization(
        photo({
          optimization_started_at: new Date(now - 60_000).toISOString(),
        }),
        now,
      ),
    ).toBe(false)
  })

  it('allows only the uploader to retry failed work', () => {
    const failed = photo({ optimization_status: 'failed' })

    expect(canRetryOptimization(failed, 'owner')).toBe(true)
    expect(canRetryOptimization(failed, 'another-member')).toBe(false)
    expect(canRetryOptimization(failed, undefined)).toBe(false)
  })

  it('makes pending work retryable but stops polling it after a grace period', () => {
    const now = Date.parse('2026-08-23T12:20:00.000Z')
    const recent = photo({
      optimization_status: 'pending',
      created_at: new Date(now - 1000).toISOString(),
    })
    const old = photo({
      optimization_status: 'pending',
      created_at: new Date(
        now - PENDING_OPTIMIZATION_POLL_MS - 1,
      ).toISOString(),
    })

    expect(canRetryOptimization(recent, 'owner')).toBe(true)
    expect(isPendingOptimizationActive(recent, now)).toBe(true)
    expect(isPendingOptimizationActive(old, now)).toBe(false)
  })

  it('hides stale processing status while keeping active work visible', () => {
    expect(
      optimizationStatusLabel(
        photo({
          optimization_started_at: '2020-01-01T00:00:00.000Z',
        }),
      ),
    ).toBeNull()
    expect(
      optimizationStatusLabel(
        photo({
          optimization_started_at: new Date().toISOString(),
        }),
      ),
    ).toBe('Optimerer…')
  })
})
