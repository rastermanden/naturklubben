import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

import {
  addComment,
  removeComment,
  type PhotoComment,
} from './usePhotoComments'

function comment(id: string, createdAt: string): PhotoComment {
  return {
    id,
    photo_id: 'photo-1',
    user_id: 'member-1',
    body: `Kommentar ${id}`,
    created_at: createdAt,
    author: { full_name: 'Alice' },
  }
}

describe('addComment', () => {
  it('appends and keeps chronological order', () => {
    const first = comment('c1', '2026-08-23T12:00:00.000Z')
    const second = comment('c2', '2026-08-23T12:05:00.000Z')

    expect(addComment([first], second)).toEqual([first, second])
    expect(addComment([second], first)).toEqual([first, second])
  })

  it('ignores the realtime echo of a comment added optimistically', () => {
    const first = comment('c1', '2026-08-23T12:00:00.000Z')
    const optimistic = addComment(undefined, first)

    expect(addComment(optimistic, { ...first })).toEqual(optimistic)
  })

  it('starts a new list when there is nothing cached yet', () => {
    const first = comment('c1', '2026-08-23T12:00:00.000Z')
    expect(addComment(undefined, first)).toEqual([first])
  })
})

describe('removeComment', () => {
  it('removes only the matching comment', () => {
    const first = comment('c1', '2026-08-23T12:00:00.000Z')
    const second = comment('c2', '2026-08-23T12:05:00.000Z')

    expect(removeComment([first, second], 'c1')).toEqual([second])
  })

  it('is safe on an empty cache', () => {
    expect(removeComment(undefined, 'c1')).toBeUndefined()
  })
})
