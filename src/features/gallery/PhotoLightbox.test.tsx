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

describe('PhotoLightbox browsing', () => {
  function renderBrowsable(
    overrides: {
      onPrevious?: (() => void) | null
      onNext?: (() => void) | null
      positionLabel?: string | null
      onClose?: () => void
    } = {},
  ) {
    render(
      <PhotoLightbox
        photo={photo}
        onClose={overrides.onClose ?? vi.fn()}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
        onPrevious={overrides.onPrevious ?? null}
        onNext={overrides.onNext ?? null}
        positionLabel={overrides.positionLabel ?? null}
      />,
    )
  }

  it('hides the browsing controls when there is nothing to browse', () => {
    renderBrowsable()

    expect(screen.queryByRole('button', { name: 'Næste billede' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Forrige billede' })).toBeNull()
  })

  it('shows the position and browses with the buttons', () => {
    const onNext = vi.fn()
    renderBrowsable({ onNext, positionLabel: 'Billede 1 af 4' })

    expect(screen.getByText('Billede 1 af 4')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Forrige billede' })
        .hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Næste billede' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('browses with the arrow keys', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    renderBrowsable({ onPrevious, onNext })

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true })

    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrevious).toHaveBeenCalledOnce()
  })

  it('browses with a horizontal swipe but not with a vertical one', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    renderBrowsable({ onPrevious, onNext })
    const dialog = screen.getByRole('dialog')

    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 60, clientY: 110 }],
    })
    expect(onNext).toHaveBeenCalledOnce()

    fireEvent.touchStart(dialog, { touches: [{ clientX: 60, clientY: 100 }] })
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 200, clientY: 110 }],
    })
    expect(onPrevious).toHaveBeenCalledOnce()

    fireEvent.touchStart(dialog, { touches: [{ clientX: 100, clientY: 40 }] })
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 130, clientY: 260 }],
    })
    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrevious).toHaveBeenCalledOnce()
  })

  it('does not close on the click that follows a swipe', () => {
    const onClose = vi.fn()
    const onNext = vi.fn()
    renderBrowsable({ onNext, onClose })
    const dialog = screen.getByRole('dialog')

    fireEvent.touchStart(dialog, { touches: [{ clientX: 220, clientY: 100 }] })
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 60, clientY: 105 }],
    })
    fireEvent.click(dialog)
    expect(onNext).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
