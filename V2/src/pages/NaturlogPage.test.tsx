import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const photo = {
  id: 'photo1',
  caption: 'En ræv i skovbunden',
  eventId: null,
  albumKey: 'without-event',
  uploaderId: 'p1',
  createdAt: 1,
  width: null,
  height: null,
  optimizationStatus: 'ready' as const,
  optimizationAttempts: 0,
  optimizationStartedAt: null,
  optimizationError: null,
  commentCount: 0,
  canDelete: false,
  isUploader: false,
  displayUrl: 'https://example.convex.cloud/api/storage/fox',
  thumbnailUrl: 'https://example.convex.cloud/api/storage/fox',
}

vi.mock('convex/react', () => ({
  useQuery: (_query: unknown, args: unknown) =>
    args === 'skip' ? undefined : photo,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}))

vi.mock('../features/gallery/PhotoComments', () => ({
  PhotoComments: () => null,
}))

vi.mock('../features/naturlog/useObservations', () => ({
  useObservations: () => [
    {
      _id: 'obs1',
      species: 'Rød ræv',
      observedOn: '2026-06-01',
      createdByName: 'Ada',
      createdById: 'p1',
      createdAt: 1,
      updatedAt: 1,
      photo,
      isOwn: false,
      canDelete: false,
    },
  ],
  useObservationActions: () => ({ remove: vi.fn() }),
  observationErrorMessage: () => 'fejl',
}))

import NaturlogPage from './NaturlogPage'

afterEach(cleanup)

describe('NaturlogPage lyskasse', () => {
  it('åbner billedet i den samme lyskasse som galleriet', () => {
    render(<NaturlogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'En ræv i skovbunden' }))
    const dialog = screen.getByRole('dialog', { name: 'En ræv i skovbunden' })
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(
      photo.displayUrl,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Luk' }))
  })
})
