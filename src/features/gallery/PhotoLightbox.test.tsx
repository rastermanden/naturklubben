import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from './types'

const mocks = vi.hoisted(() => ({
  userId: 'member-id',
  isAdmin: false,
}))

vi.mock('./useDisplayUrl', () => ({
  useDisplayUrl: () => ({
    url: 'https://example.test/photo.jpg',
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: mocks.userId } } }),
}))
vi.mock('../admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: mocks.isAdmin, loading: false }),
}))

import { PhotoLightbox } from './PhotoLightbox'

const photo: Photo = {
  id: 'photo-1',
  storage_path: 'owner-id/photo-1.jpg',
  optimized_path: 'owner-id/photo-1-optimized.jpg',
  thumbnail_path: 'owner-id/photo-1-thumb.jpg',
  caption: 'Skovtur',
  event_id: null,
  event: null,
  uploaded_by: 'owner-id',
  created_at: '2026-08-23T12:00:00.000Z',
  optimization_status: 'ready',
  optimization_attempts: 1,
  optimization_started_at: '2026-08-23T12:00:00.000Z',
  optimization_completed_at: '2026-08-23T12:01:00.000Z',
  optimization_error: null,
}

function renderLightbox(onDelete = vi.fn()) {
  render(
    <PhotoLightbox
      photo={photo}
      onClose={vi.fn()}
      onDelete={onDelete}
      onRetryOptimization={vi.fn()}
      deleting={false}
      retrying={false}
      actionError={null}
    />,
  )
  return onDelete
}

beforeEach(() => {
  mocks.userId = 'member-id'
  mocks.isAdmin = false
})

afterEach(cleanup)

describe('PhotoLightbox deletion', () => {
  it('hides deletion from members who do not own the photo', () => {
    renderLightbox()

    expect(screen.queryByRole('button', { name: 'Slet billede' })).toBeNull()
  })

  it('allows an administrator to delete another members photo', () => {
    mocks.isAdmin = true
    const onDelete = renderLightbox()

    fireEvent.click(screen.getByRole('button', { name: 'Slet billede' }))

    expect(onDelete).toHaveBeenCalledWith(photo)
  })

  it('continues to allow the uploader to delete the photo', () => {
    mocks.userId = 'owner-id'

    expect(() => renderLightbox()).not.toThrow()
    expect(screen.getByRole('button', { name: 'Slet billede' })).toBeTruthy()
  })
})
