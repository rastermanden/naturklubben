import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { Photo } from '../features/gallery/types'
import type { GalleryAlbum } from '../features/gallery/useGalleryAlbums'

const mocks = vi.hoisted(() => ({
  albumsQuery: {
    data: [] as GalleryAlbum[],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
  photosQuery: {
    data: undefined as { photos: Photo[] } | undefined,
    isLoading: false,
    isError: false,
    isSuccess: false,
    refetch: vi.fn(),
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  },
  photoQuery: {
    data: undefined as Photo | null | undefined,
    isSuccess: false,
  },
  commentCounts: {
    data: [] as { photo_id: string; comment_count: number }[],
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
  validateFiles: vi.fn((): string | null => null),
}))

vi.mock('../features/gallery/usePhotos', () => ({
  usePhotos: () => mocks.photosQuery,
  usePhoto: () => mocks.photoQuery,
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.test/${path}` },
        }),
      }),
    },
  },
}))
vi.mock('../features/gallery/useGalleryAlbums', () => ({
  useGalleryAlbums: () => mocks.albumsQuery,
}))
vi.mock('../features/gallery/usePhotoCommentCounts', () => ({
  usePhotoCommentCounts: () => mocks.commentCounts,
  commentCountFor: (
    counts: { photo_id: string; comment_count: number }[] | undefined,
    photoId: string,
  ) => counts?.find((row) => row.photo_id === photoId)?.comment_count ?? 0,
}))
vi.mock('../features/gallery/useUploadPhotos', () => ({
  useUploadPhotos: () => mocks.upload,
  validateFiles: mocks.validateFiles,
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
  PhotoThumbnail: ({
    photo,
    commentCount,
  }: {
    photo: Photo
    commentCount?: number
  }) => (
    <button type="button">
      {photo.caption}
      {commentCount ? ` (${commentCount})` : ''}
    </button>
  ),
}))
vi.mock('../features/gallery/PhotoLightbox', () => ({
  PhotoLightbox: ({
    photo,
    onRetryOptimization,
    onPrevious,
    onNext,
    positionLabel,
  }: {
    photo: Photo
    onRetryOptimization: (photo: Photo) => void
    onPrevious?: (() => void) | null
    onNext?: (() => void) | null
    positionLabel?: string | null
  }) => (
    <div role="dialog" aria-label={`Åbent ${photo.id}`}>
      {photo.id}
      {positionLabel && <p>{positionLabel}</p>}
      <button type="button" onClick={() => onRetryOptimization(photo)}>
        Genforsøg optimering
      </button>
      <button
        type="button"
        disabled={!onPrevious}
        onClick={onPrevious ?? undefined}
      >
        Forrige billede
      </button>
      <button type="button" disabled={!onNext} onClick={onNext ?? undefined}>
        Næste billede
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

function album(overrides: Partial<GalleryAlbum> = {}): GalleryAlbum {
  return {
    albumId: 'event-1',
    eventId: 'event-1',
    title: 'Event event-1',
    eventDate: '2026-08-20T12:00:00.000Z',
    photoCount: 1,
    cover: null,
    ...overrides,
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
  mocks.albumsQuery.data = []
  mocks.albumsQuery.isLoading = false
  mocks.albumsQuery.isError = false
  mocks.albumsQuery.isSuccess = true
  mocks.albumsQuery.refetch.mockReset()
  mocks.commentCounts.data = []
  mocks.photosQuery.data = undefined
  mocks.photosQuery.isLoading = false
  mocks.photosQuery.isError = false
  mocks.photosQuery.isSuccess = false
  mocks.photosQuery.refetch.mockReset()
  mocks.photosQuery.fetchNextPage.mockReset()
  mocks.photosQuery.hasNextPage = false
  mocks.photosQuery.isFetchingNextPage = false
  mocks.photosQuery.isFetchNextPageError = false
  mocks.photoQuery.data = undefined
  mocks.photoQuery.isSuccess = false
  mocks.deletePhoto.mutate.mockReset()
  mocks.retryOptimization.mutate.mockReset()
  mocks.validateFiles.mockReset()
  mocks.validateFiles.mockReturnValue(null)
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

  it('shows an empty state when the gallery has no photos at all', () => {
    mocks.photosQuery.data = { photos: [] }
    mocks.photosQuery.isSuccess = true
    renderGallery()
    expect(screen.getByText(/Ingen billeder endnu/)).toBeTruthy()
  })

  it('opens the gallery in the album grid, grouped by event (#218)', () => {
    mocks.photosQuery.data = {
      photos: [photo('photo-1', 'Bål', 'event-1')],
    }
    mocks.photosQuery.isSuccess = true
    mocks.albumsQuery.data = [
      album({ photoCount: 3 }),
      album({
        albumId: 'without-event',
        eventId: null,
        title: 'Uden begivenhed',
        eventDate: null,
        photoCount: 2,
      }),
    ]
    renderGallery()

    expect(screen.getByTestId('gallery-album-grid')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Event event-1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Uden begivenhed/ })).toBeTruthy()
    // Ingen enkeltbilleder på albumforsiden.
    expect(screen.queryByRole('button', { name: 'Bål' })).toBeNull()
  })

  it('opens an album and shows only its photos, with a deep link (#218)', () => {
    mocks.photosQuery.data = {
      photos: [
        photo('photo-1', 'Bål', 'event-1'),
        photo('photo-2', 'Sø', 'event-2'),
      ],
    }
    mocks.photosQuery.isSuccess = true
    mocks.albumsQuery.data = [album({ photoCount: 1 })]

    renderGallery('/billeder?album=event-1')

    expect(screen.getByRole('button', { name: 'Bål' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sø' })).toBeNull()
    expect(screen.getByText('Event event-1')).toBeTruthy()
  })

  it('opens an album from the grid by clicking it', () => {
    mocks.photosQuery.data = {
      photos: [
        photo('photo-1', 'Bål', 'event-1'),
        photo('photo-2', 'Sø', 'event-2'),
      ],
    }
    mocks.photosQuery.isSuccess = true
    mocks.albumsQuery.data = [
      album({ photoCount: 1 }),
      album({
        albumId: 'event-2',
        eventId: 'event-2',
        title: 'Event event-2',
        photoCount: 1,
      }),
    ]
    renderGallery()

    fireEvent.click(screen.getByRole('button', { name: /Event event-1/ }))

    expect(screen.getByRole('button', { name: 'Bål' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sø' })).toBeNull()
  })

  it('goes back to the album grid', () => {
    mocks.photosQuery.data = {
      photos: [photo('photo-1', 'Bål', 'event-1')],
    }
    mocks.photosQuery.isSuccess = true
    mocks.albumsQuery.data = [album({ photoCount: 1 })]
    renderGallery('/billeder?album=event-1')

    fireEvent.click(screen.getByRole('button', { name: '← Alle album' }))

    expect(screen.getByTestId('gallery-album-grid')).toBeTruthy()
  })

  it('shows a fallback when the opened album has no matching photos', () => {
    mocks.photosQuery.data = {
      photos: [photo('photo-1', 'Bål', 'event-1')],
    }
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?album=event-2')

    expect(
      screen.getByText('Der er ingen billeder i dette album endnu.'),
    ).toBeTruthy()
  })

  it('shows the comment count badge from the batched counts hook', () => {
    mocks.photosQuery.data = {
      photos: [photo('photo-1', 'Bål', 'event-1')],
    }
    mocks.photosQuery.isSuccess = true
    mocks.commentCounts.data = [{ photo_id: 'photo-1', comment_count: 2 }]
    renderGallery('/billeder?album=event-1')

    expect(screen.getByRole('button', { name: 'Bål (2)' })).toBeTruthy()
  })

  it('opens a legacy photo deep-link within its own album even without an album param', () => {
    mocks.photosQuery.data = {
      photos: [
        photo('photo-1', 'Bål', 'event-1'),
        photo('photo-2', 'Sø', 'event-2'),
      ],
    }
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?photo=photo-1')

    expect(screen.getByRole('dialog', { name: 'Åbent photo-1' })).toBeTruthy()
    // Album-gitteret vises stadig i baggrunden, ikke et fladt fotostream.
    expect(screen.getByTestId('gallery-album-grid')).toBeTruthy()
  })

  it('fetches a shared photo that is outside the loaded pages', () => {
    const linked = photo('photo-older', 'Gammelt billede', 'event-1')
    mocks.photosQuery.data = {
      photos: [photo('photo-new', 'Nyt billede', 'event-1')],
    }
    mocks.photosQuery.isSuccess = true
    mocks.photosQuery.hasNextPage = true
    mocks.photoQuery.data = linked
    mocks.photoQuery.isSuccess = true

    renderGallery('/billeder?album=event-1&photo=photo-older')

    expect(
      screen.getByRole('dialog', { name: 'Åbent photo-older' }),
    ).toBeTruthy()
    expect(screen.queryByText('Billedlinket findes ikke længere.')).toBeNull()
  })

  it('starts persistent optimization retry from the active photo', () => {
    const failed = photo('photo-1', 'Bål', 'event-1')
    failed.optimization_status = 'failed'
    failed.optimization_error = 'Kunne ikke behandles'
    mocks.photosQuery.data = { photos: [failed] }
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?album=event-1&photo=photo-1')

    fireEvent.click(
      screen.getByRole('button', { name: 'Genforsøg optimering' }),
    )
    expect(mocks.retryOptimization.mutate).toHaveBeenCalledWith(
      'photo-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('links invalid files to the upload controls and focuses the visible chooser', async () => {
    mocks.validateFiles.mockReturnValue('Filen er for stor.')
    renderGallery()

    const fileInput = screen.getByLabelText('Vælg billeder fra enheden')
    const chooser = screen.getByRole('button', { name: 'Vælg billeder' })
    chooser.focus()
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['billede'], 'foto.jpg', { type: 'image/jpeg' })],
      },
    })

    const error = await screen.findByText('Filen er for stor.')
    expect(fileInput.getAttribute('aria-invalid')).toBe('true')
    expect(fileInput.getAttribute('aria-describedby')).toBe(error.id)
    expect(chooser.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(chooser)
  })

  it('loads another bounded page inside an album', () => {
    mocks.photosQuery.data = {
      photos: [photo('photo-1', 'Bål', 'event-1')],
    }
    mocks.photosQuery.isSuccess = true
    mocks.photosQuery.hasNextPage = true
    renderGallery('/billeder?album=event-2')

    expect(
      screen.queryByText('Der er ingen billeder i dette album endnu.'),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hent flere billeder' }))
    expect(mocks.photosQuery.fetchNextPage).toHaveBeenCalledOnce()
  })

  it('browses through the album photos from the lightbox', () => {
    mocks.photosQuery.data = {
      photos: [
        photo('photo-1', 'Bål', 'event-1'),
        photo('photo-2', 'Sø', 'event-2'),
        photo('photo-3', 'Skov', 'event-1'),
      ],
    }
    mocks.photosQuery.isSuccess = true
    renderGallery('/billeder?album=event-1&photo=photo-1')

    expect(screen.getByText('Billede 1 af 2')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Forrige billede' })
        .hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Næste billede' }))

    // Billedet uden for albummet springes over.
    expect(screen.getByRole('dialog', { name: 'Åbent photo-3' })).toBeTruthy()
    expect(screen.getByText('Billede 2 af 2')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Næste billede' })
        .hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Forrige billede' }))
    expect(screen.getByRole('dialog', { name: 'Åbent photo-1' })).toBeTruthy()
  })

  it('fetches the next page when browsing towards the end of the loaded photos', () => {
    mocks.photosQuery.data = {
      photos: [photo('photo-1', 'Bål', null), photo('photo-2', 'Sø', null)],
    }
    mocks.photosQuery.isSuccess = true
    mocks.photosQuery.hasNextPage = true
    renderGallery('/billeder?photo=photo-2')

    expect(mocks.photosQuery.fetchNextPage).toHaveBeenCalledOnce()
    expect(screen.getByText('Billede 2 af 2+')).toBeTruthy()
  })

  it('links camera validation only to the camera control', async () => {
    mocks.validateFiles.mockReturnValue('Filen er for stor.')
    renderGallery()

    const cameraInput = screen.getByLabelText('Tag et billede med kameraet')
    const cameraButton = screen.getByRole('button', { name: 'Tag billede' })
    fireEvent.change(cameraInput, {
      target: {
        files: [new File(['billede'], 'foto.jpg', { type: 'image/jpeg' })],
      },
    })

    const error = await screen.findByText('Filen er for stor.')
    expect(cameraInput.getAttribute('aria-invalid')).toBe('true')
    expect(cameraInput.getAttribute('aria-describedby')).toBe(error.id)
    expect(cameraButton.getAttribute('aria-describedby')).toBe(error.id)
    expect(
      screen
        .getByLabelText('Vælg billeder fra enheden')
        .getAttribute('aria-invalid'),
    ).toBeNull()
    expect(document.activeElement).toBe(cameraButton)
  })
})
