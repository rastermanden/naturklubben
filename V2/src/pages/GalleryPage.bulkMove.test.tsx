import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GalleryAlbum, Photo } from '../features/gallery/types'

const mockState: {
  albums: GalleryAlbum[]
  photos: Photo[]
  eventOptions: { id: string; title: string; startAt: number }[]
} = {
  albums: [],
  photos: [],
  eventOptions: [],
}

const movePhotosSpy = vi.fn()
const updatePhotoSpy = vi.fn()
const noopMutation = vi.fn()

vi.mock('convex/react', () => ({
  useQuery: (ref: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    const name = getFunctionName(ref)
    if (name === 'gallery:listAlbums') return mockState.albums
    if (name === 'calendar:eventOptions') return mockState.eventOptions
    if (name === 'gallery:getPhoto') {
      const photoId = (args as { photoId?: string }).photoId
      return mockState.photos.find((p) => p.id === photoId) ?? null
    }
    return undefined
  },
  usePaginatedQuery: () => ({
    results: mockState.photos,
    status: 'Exhausted',
    loadMore: vi.fn(),
    isLoading: false,
  }),
  useMutation: (ref: FunctionReference<'mutation'>) => {
    const name = getFunctionName(ref)
    if (name === 'gallery:movePhotos') return movePhotosSpy
    if (name === 'gallery:updatePhoto') return updatePhotoSpy
    return noopMutation
  },
  useAction: () => vi.fn(),
}))

vi.mock('../features/gallery/useUploadPhotos', () => ({
  useUploadPhotos: () => ({
    items: [],
    enqueue: vi.fn(),
    clearSaved: vi.fn(),
  }),
  validateFiles: () => null,
}))

vi.mock('../features/gallery/useAutoOptimizePendingPhotos', () => ({
  useAutoOptimizePendingPhotos: () => undefined,
}))

vi.mock('../features/gallery/PhotoComments', () => ({
  PhotoComments: () => null,
}))

import GalleryPage from './GalleryPage'

function makePhoto(id: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    caption: `Billede ${id}`,
    eventId: null,
    albumKey: 'without-event',
    uploaderId: 'p1',
    createdAt: 1,
    width: 800,
    height: 600,
    optimizationStatus: 'ready',
    optimizationAttempts: 0,
    optimizationStartedAt: null,
    optimizationError: null,
    commentCount: 0,
    canDelete: true,
    canEdit: true,
    isUploader: true,
    displayUrl: `https://example.convex.cloud/${id}.jpg`,
    thumbnailUrl: `https://example.convex.cloud/${id}-thumb.jpg`,
    ...overrides,
  }
}

function renderGallery(path = '/billeder?album=without-event') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GalleryPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  movePhotosSpy.mockReset().mockResolvedValue({
    movedCount: 2,
    albumKey: 'event1',
    eventId: 'event1',
  })
  updatePhotoSpy.mockReset().mockResolvedValue({
    id: 'p1',
    caption: 'Ny tekst',
    albumKey: 'event1',
    eventId: 'event1',
  })
  mockState.albums = [
    {
      albumId: 'without-event',
      eventId: null,
      title: 'Uden begivenhed',
      photoCount: 3,
      latestPhotoAt: 3,
      coverPhotoId: 'p1',
      coverUrl: null,
    },
    {
      albumId: 'event1',
      eventId: 'event1',
      title: 'Hornfisketur',
      photoCount: 1,
      latestPhotoAt: 1,
      coverPhotoId: null,
      coverUrl: null,
    },
  ]
  mockState.photos = [
    makePhoto('p1', { canEdit: true }),
    makePhoto('p2', { canEdit: true }),
    makePhoto('p3', { canEdit: false, canDelete: false, isUploader: false }),
  ]
  mockState.eventOptions = [
    {
      id: 'event1',
      title: 'Hornfisketur',
      startAt: Date.UTC(2026, 5, 14, 10),
    },
  ]
})

afterEach(cleanup)

describe('GalleryPage: flyt flere billeder og redigér (#345)', () => {
  it('lader medlemmet vælge flere redigérbare billeder i "Uden begivenhed" og knytte dem til én begivenhed i ét trin', async () => {
    renderGallery()

    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))

    // Andet medlems billede (canEdit=false) kan ikke vælges.
    const foreignButton = screen.getByRole('button', {
      name: 'Kan ikke vælges: Billede p3',
    }) as HTMLButtonElement
    expect(foreignButton.disabled).toBe(true)

    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Billede p1' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Billede p2' }),
    )
    expect(screen.getByText('2 billeder valgt')).toBeTruthy()

    const select = screen.getByLabelText(
      'Flyt til begivenhed',
    ) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'event1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Flyt til begivenhed' }))

    await waitFor(() =>
      expect(movePhotosSpy).toHaveBeenCalledWith({
        photoIds: ['p1', 'p2'],
        eventId: 'event1',
      }),
    )

    expect(await screen.findByText('2 billeder blev flyttet.')).toBeTruthy()
    expect(
      screen.queryByRole('region', { name: 'Flyt billeder til en begivenhed' }),
    ).toBeNull()
  })

  it('"Vælg alle" vælger kun de billeder, brugeren må flytte', () => {
    renderGallery()

    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vælg alle' }))

    expect(screen.getByText('2 billeder valgt')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Fravælg billede: Billede p1' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Kan ikke vælges: Billede p3' })
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('viser ikke "Flyt flere billeder" uden redigérbare billeder eller i et begivenhedsalbum', () => {
    mockState.photos = [
      makePhoto('p3', { canEdit: false, canDelete: false, isUploader: false }),
    ]
    const { unmount } = renderGallery('/billeder?album=without-event')
    expect(
      screen.queryByRole('button', { name: 'Flyt flere billeder' }),
    ).toBeNull()
    unmount()

    mockState.photos = [
      makePhoto('p1', { eventId: 'event1', albumKey: 'event1', canEdit: true }),
    ]
    renderGallery('/billeder?album=event1')
    expect(
      screen.queryByRole('button', { name: 'Flyt flere billeder' }),
    ).toBeNull()
  })

  it('beholder tilbage-navigation, når "Uden begivenhed" bliver tomt', () => {
    mockState.albums = []
    mockState.photos = []
    renderGallery('/billeder?album=without-event')

    expect(screen.getByRole('button', { name: /Alle album/ })).toBeTruthy()
    expect(screen.getByText('Ingen billeder i dette album.')).toBeTruthy()
  })

  it('sender ændringer fra lysboksen videre til gallery.updatePhoto', async () => {
    renderGallery('/billeder?album=without-event')

    fireEvent.click(
      screen.getByRole('button', { name: 'Åbn billede: Billede p1' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))

    fireEvent.change(screen.getByLabelText('Billedtekst'), {
      target: { value: 'Ny tekst' },
    })
    fireEvent.change(screen.getByLabelText('Begivenhed'), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))

    await waitFor(() =>
      expect(updatePhotoSpy).toHaveBeenCalledWith({
        photoId: 'p1',
        caption: 'Ny tekst',
        eventId: 'event1',
      }),
    )
  })
})
