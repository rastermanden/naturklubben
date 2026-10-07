import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

import { commentCountFor } from './usePhotoCommentCounts'

describe('commentCountFor', () => {
  it('returns the count for a known photo', () => {
    expect(
      commentCountFor(
        [
          { photo_id: 'photo-1', comment_count: 2 },
          { photo_id: 'photo-2', comment_count: 0 },
        ],
        'photo-1',
      ),
    ).toBe(2)
  })

  it('defaults to zero for a photo without a row', () => {
    expect(commentCountFor([], 'photo-1')).toBe(0)
  })

  it('is safe when the counts have not loaded yet', () => {
    expect(commentCountFor(undefined, 'photo-1')).toBe(0)
  })
})
