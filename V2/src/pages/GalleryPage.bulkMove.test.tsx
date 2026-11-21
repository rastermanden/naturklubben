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
  albums: GalleryAlbum[] | undefined
  photos: Photo[]
  paginationStatus: 'Exhausted' | 'CanLoadMore'
  eventOptions: { id: string; title: string; startAt: number }[]
} = {
  albums: [],
  photos: [],
  paginationStatus: 'Exhausted',
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
    status: mockState.paginationStatus,
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
    mediaKind: 'image',
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
  mockState.paginationStatus = 'Exhausted'
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
      name: 'Andet medlems billede, kan ikke vælges: Billede p3',
    }) as HTMLButtonElement
    expect(foreignButton.disabled).toBe(true)

    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Billede p1' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Billede p2' }),
    )
    expect(screen.getByText('2 billeder valgt')).toBeTruthy()

    const select = screen.getByRole('combobox', {
      name: 'Begivenhed',
    }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'event1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Flyt 2 billeder' }))

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

  it('flytter over 100 valgte billeder i klumper på maks. 100 og advarer når flere sider findes (B1)', async () => {
    const many = Array.from({ length: 105 }, (_, index) =>
      makePhoto(`p${index + 1}`, { canEdit: true }),
    )
    mockState.photos = many
    mockState.albums = [
      {
        albumId: 'without-event',
        eventId: null,
        title: 'Uden begivenhed',
        photoCount: 140,
        latestPhotoAt: 3,
        coverPhotoId: 'p1',
        coverUrl: null,
      },
    ]
    mockState.paginationStatus = 'CanLoadMore'
    movePhotosSpy
      .mockResolvedValueOnce({
        movedCount: 100,
        albumKey: 'event1',
        eventId: 'event1',
      })
      .mockResolvedValueOnce({
        movedCount: 5,
        albumKey: 'event1',
        eventId: 'event1',
      })

    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))

    expect(
      screen.getByText(
        'Viser 105 af 140 billeder. Hent flere nederst for at vælge resten.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vælg viste' }))
    expect(screen.getByText('105 billeder valgt')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Begivenhed' }), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt 105 billeder' }))

    await waitFor(() => expect(movePhotosSpy).toHaveBeenCalledTimes(2))
    expect(movePhotosSpy.mock.calls[0]?.[0].photoIds).toHaveLength(100)
    expect(movePhotosSpy.mock.calls[1]?.[0].photoIds).toHaveLength(5)
    expect(await screen.findByText('105 billeder blev flyttet.')).toBeTruthy()
  })

  it('beholder uflyttede billeder valgt ved fejl på anden klump (B1)', async () => {
    mockState.photos = Array.from({ length: 105 }, (_, index) =>
      makePhoto(`p${index + 1}`, { canEdit: true }),
    )
    movePhotosSpy
      .mockResolvedValueOnce({
        movedCount: 100,
        albumKey: 'event1',
        eventId: 'event1',
      })
      .mockRejectedValueOnce({ data: 'PHOTO_EVENT_NOT_FOUND' })

    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vælg alle' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Begivenhed' }), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt 105 billeder' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      '100 billeder blev flyttet, før fejlen opstod.',
    )
    expect(screen.getByText('5 billeder valgt')).toBeTruthy()
  })

  it('"Vælg alle" vælger kun de billeder, brugeren må flytte, og uden-billedtekst-label forklarer hvorfor andres er låst (B8)', () => {
    mockState.photos = [
      makePhoto('p1', { canEdit: true }),
      makePhoto('p2', { canEdit: true }),
      makePhoto('p3', {
        caption: null,
        canEdit: false,
        canDelete: false,
        isUploader: false,
      }),
    ]
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
        .getByRole('button', {
          name: 'Andet medlems billede uden billedtekst, kan ikke vælges',
        })
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('flytter tastaturfokus ind i værktøjslinjen ved åbning og tilbage til knap eller status ved lukning (B3)', async () => {
    renderGallery()

    const openBtn = screen.getByRole('button', { name: 'Flyt flere billeder' })
    fireEvent.click(openBtn)

    const region = screen.getByRole('region', {
      name: 'Flyt billeder til en begivenhed',
    })
    expect(document.activeElement).toBe(region)

    fireEvent.click(screen.getByRole('button', { name: 'Annullér' }))
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Flyt flere billeder' }),
    )

    // Når det sidste redigérbare billede flyttes ud, flyttes fokus til statusbeskeden i stedet for body.
    mockState.photos = [makePhoto('p1', { canEdit: true })]
    movePhotosSpy.mockImplementationOnce(async () => {
      mockState.photos = []
      mockState.albums = []
      return { movedCount: 1, albumKey: 'event1', eventId: 'event1' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vælg alle' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Begivenhed' }), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt 1 billede' }))

    const notice = await screen.findByText('1 billede blev flyttet.')
    expect(document.activeElement).toBe(notice)
  })

  it('viser ikke "Albummet findes ikke længere", mens albumlisten stadig indlæses (B5)', () => {
    mockState.albums = undefined
    mockState.photos = [
      makePhoto('p1', { eventId: 'event1', albumKey: 'event1', canEdit: true }),
    ]
    renderGallery('/billeder?album=event1')

    expect(screen.queryByText(/Albummet findes ikke længere/)).toBeNull()
  })

  it('har adskilte navne for vælger og knap og viser hjælpetekst når ingen begivenheder findes (B6)', () => {
    mockState.eventOptions = []
    renderGallery()

    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))

    expect(screen.getByRole('combobox', { name: 'Begivenhed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flyt valgte' })).toBeTruthy()
    expect(
      screen.getByText(
        'Der er ingen begivenheder endnu. Opret en begivenhed i kalenderen først.',
      ),
    ).toBeTruthy()
  })

  it('låser markering og begivenhedsvælger mens flytning er i gang (B7)', async () => {
    let resolveMove: (value: {
      movedCount: number
      albumKey: string
      eventId: string | null
    }) => void = () => {}
    movePhotosSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMove = resolve
        }),
    )

    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Billede p1' }),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Begivenhed' }), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt 1 billede' }))

    const secondThumb = screen.getByRole('button', {
      name: 'Vælg billede: Billede p2',
    }) as HTMLButtonElement
    expect(secondThumb.disabled).toBe(true)
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Begivenhed',
        }) as HTMLSelectElement
      ).disabled,
    ).toBe(true)

    fireEvent.click(secondThumb)
    expect(screen.getByText('1 billede valgt')).toBeTruthy()

    resolveMove({ movedCount: 1, albumKey: 'event1', eventId: 'event1' })
    expect(await screen.findByText('1 billede blev flyttet.')).toBeTruthy()
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
