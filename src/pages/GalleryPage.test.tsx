import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { Photo } from '../features/gallery/types'

const mocks = vi.hoisted(() => ({
  photosQuery: {
    data: undefined as Photo[] | undefined,
    isLoading: false,
    isError: false,
    isSuccess: false,
    refetch: vi.fn(),
  },
  upload: {
    items: [] as never[],
    enqueue: vi.fn(),
    retry: vi.fn(),
    clearSaved: vi.fn(),
    isUploading: false,
  },
  deletePhoto: {
    isPending: false,
    mutate: vi.fn(),
  },
  retryOptimization: {
    isPending: false,
    variables: undefined as string | undefined,
    mutate: vi.fn(),
  },
}))

vi.mock('../features/gallery/usePhotos', () => ({
  usePhotos: () => mocks.photosQuery,
}))
vi.mock('../features/gallery/useUploadPhotos', () => ({
  useUploadPhotos: () => mocks.upload,
  validateFiles: () => null,
}))
vi.mock('../features/gallery/useDeletePhoto', () => ({
  useDeletePhoto: () => mocks.deletePhoto,
}))
vi.mock('../features/gallery/useRetryPhotoOptimization', () => ({
  useRetryPhotoOptimization: () => mocks.retryOptimization,
}))
vi.mock('../features/gallery/useAutoOptimizePendingPhotos', () => ({
  useAutoOptimizePendingPhotos: () => {},
}))
vi.mock('../features/gallery/useEventsForSelect', () => ({
  useEventsForSelect: () => ({
    data: [],
    isError: false,
  }),
}))
vi.mock('../features/gallery/PhotoThumbnail', () => ({
  PhotoThumbnail: ({ photo }: { photo: Photo }) => (
    <button type="button">{photo.caption}</button>
  ),
}))
vi.mock('../features/gallery/PhotoLightbox', () => ({
  PhotoLightbox: ({
    photo,
    onRetryOptimization,
  }: {
    photo: Photo
    onRetryOptimization: (photo: Photo) => void
  }) => (
    <div role="dialog" aria-label={`Åbent ${photo.id}`}>
      {photo.id}
      <button type="button" onClick={() => onRetryOptimization(photo)}>
        Genforsøg optimering
      </button>
    </div>
  ),
}))

import GalleryPage from './GalleryPage'

function photo(id: string, caption: string, eventId: string | null): Photo {
  return {
    id,
    storage_path: `member/${id}.jpg`,
    optimized_path: `${id}.jpg`,
    thumbnail_path: `${id}-thumb.jpg`,
    caption,
    event_id: eventId,
    event: eventId ? { id: eventId, title: `Event ${eventId}` } : null,
    uploaded_by: 'member',
    created_at: '2026-08-23T12:00:00.000Z',
    optimization_status: 'ready',
    optimization_attempts: 1,
    optimization_started_at: '2026-08-23T12:00:00.000Z',
    optimization_completed_at: '2026-08-23T12:01:00.000Z',
    optimization_error: null,
  }
}

function renderGallery(path = '/billeder') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GalleryPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.photosQuery.data = undefined
  mocks.photosQuery.isLoading = false
  mocks.photosQuery.isError = false
  mocks.photosQuery.isSuccess = false
  mocks.photosQuery.refetch.mockReset()
  mocks.deletePhoto.mutate.mockReset()
  mocks.retryOptimization.mutate.mockReset()
})

afterEach(cleanup)

describe('GalleryPage', () => {
  it('shows explicit loading and query error states with retry', () => {
    mocks.photosQuery.isLoading = true
    const view = renderGallery()
    expect(screen.getByText('Henter billeder…')).toBeTruthy()

    view.unmount()
    mocks.photosQuery.isLoading = false
    mocks.photosQuery.isError = true
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Prøv igen' }))

    expect(mocks.photosQuery.refetch).toHaveBeenCalledOnce()
  })

  it('distinguishes an empty gallery from an empty event filter', () => {
    mocks.photosQuery.data = []
    mocks.photosQuery.isSuccess = true
    const view = renderGallery()
    expect(screen.getByText(/Ingen billeder endnu/)).toBeTruthy()

    view.unmount()
    mocks.photosQuery.data = [
      photo('photo-1', 'Bål', 'event-1'),
      photo('photo-2', 'Sø', null),
    ]
    renderGallery('/billeder?event=event-2')
    expect(
      screen.getByText('Der er ingen billeder for det valgte filter.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vis alle billeder' }))
    expect(screen.getByRole('button', { name: 'Bål' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sø' })).toBeTruthy()
  })

  it('filters by event through the URL-backed select', () => {
    mocks.photosQuery.data = [
      photo('photo-1', 'Bål', 'event-1'),
      photo('photo-2', 'Sø', 'event-2'),
    ]
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?event=event-1')

    expect(screen.getByRole('button', { name: 'Bål' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sø' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Filtrér efter begivenhed'), {
      target: { value: 'event-2' },
    })
    expect(screen.queryByRole('button', { name: 'Bål' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sø' })).toBeTruthy()
  })

  it('opens a legacy photo deep-link even when the event filter excludes it', () => {
    mocks.photosQuery.data = [
      photo('photo-1', 'Bål', 'event-1'),
      photo('photo-2', 'Sø', 'event-2'),
    ]
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?event=event-1&photo=photo-2')

    expect(screen.getByRole('dialog', { name: 'Åbent photo-2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sø' })).toBeNull()
  })

  it('starts persistent optimization retry from the active photo', () => {
    const failed = photo('photo-1', 'Bål', 'event-1')
    failed.optimization_status = 'failed'
    failed.optimization_error = 'Kunne ikke behandles'
    mocks.photosQuery.data = [failed]
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?photo=photo-1')

    fireEvent.click(
      screen.getByRole('button', { name: 'Genforsøg optimering' }),
    )
    expect(mocks.retryOptimization.mutate).toHaveBeenCalledWith(
      'photo-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })
})
