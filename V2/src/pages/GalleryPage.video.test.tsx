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
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '../features/gallery/galleryMedia'

const mockState: {
  albums: GalleryAlbum[] | undefined
  photos: Photo[]
  eventOptions: { id: string; title: string; startAt: number }[]
} = {
  albums: [],
  photos: [],
  eventOptions: [],
}

const enqueueSpy = vi.fn()
const movePhotosSpy = vi.fn()

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
    return vi.fn()
  },
  useAction: () => vi.fn(),
}))

vi.mock('../features/gallery/useUploadPhotos', () => ({
  useUploadPhotos: () => ({
    items: [],
    enqueue: enqueueSpy,
    retry: vi.fn(),
    clearSaved: vi.fn(),
    isUploading: false,
  }),
}))

vi.mock('../features/gallery/useAutoOptimizePendingPhotos', () => ({
  useAutoOptimizePendingPhotos: () => undefined,
}))

vi.mock('../features/gallery/PhotoComments', () => ({
  PhotoComments: () => null,
}))

import GalleryPage from './GalleryPage'

function makeItem(id: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    mediaKind: 'image',
    mimeType: 'image/jpeg',
    caption: `Element ${id}`,
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
    displayUrl: `https://example.convex.site/photo?token=${id}`,
    thumbnailUrl: `https://example.convex.site/photo?token=${id}-thumb`,
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
  enqueueSpy.mockReset()
  movePhotosSpy.mockReset().mockResolvedValue({
    movedCount: 2,
    albumKey: 'event1',
    eventId: 'event1',
  })
  mockState.eventOptions = [
    {
      id: 'event1',
      title: 'Svampetur',
      startAt: Date.UTC(2026, 8, 12, 10),
    },
  ]
  mockState.albums = [
    {
      albumId: 'without-event',
      eventId: null,
      title: 'Uden begivenhed',
      photoCount: 2,
      latestPhotoAt: 2,
      coverPhotoId: 'v1',
      coverUrl: null,
      coverIsVideo: true,
    },
  ]
  mockState.photos = [
    makeItem('v1', {
      mediaKind: 'video',
      mimeType: 'video/mp4',
      caption: 'Bækken i skoven',
      displayUrl: 'https://example.convex.site/video?token=vid1',
      thumbnailUrl: 'https://example.convex.site/photo?token=vid1-thumb',
    }),
    makeItem('v2', {
      mediaKind: 'video',
      mimeType: 'video/quicktime',
      caption: null,
      displayUrl: 'https://example.convex.site/video?token=vid2',
      thumbnailUrl: null,
    }),
  ]
})

afterEach(cleanup)

describe('GalleryPage: video i galleriet (#365)', () => {
  it('accepterer mp4/webm/mov op til 50 MB, afviser forkerte typer og for store filer på dansk uden upload', () => {
    renderGallery()

    const input = screen.getByLabelText(
      'Vælg billeder og videoer fra enheden',
    ) as HTMLInputElement
    expect(input.accept).toContain('video/mp4')
    expect(input.accept).toContain('video/webm')
    expect(input.accept).toContain('video/quicktime')

    // Ugyldig videotype og for stor video/billede afvises straks.
    const badVideo = new File(['avi'], 'gammel.avi', {
      type: 'video/x-msvideo',
    })
    const bigVideo = new File(['big'], 'lang.mp4', { type: 'video/mp4' })
    Object.defineProperty(bigVideo, 'size', { value: MAX_VIDEO_BYTES + 1 })
    const bigPhoto = new File(['img'], 'kæmpe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigPhoto, 'size', { value: MAX_IMAGE_BYTES + 1 })

    fireEvent.change(input, {
      target: { files: [badVideo, bigVideo, bigPhoto] },
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      'gammel.avi kan ikke lægges op. Brug mp4, webm eller mov.',
    )
    expect(alert.textContent).toContain(
      'lang.mp4 er for stor. Videoer må højst være 50 MB.',
    )
    expect(alert.textContent).toContain(
      'kæmpe.jpg er for stor. Billeder må højst være 15 MB.',
    )
    expect(enqueueSpy).not.toHaveBeenCalled()

    // Gyldig video sendes i kø sammen med valgt begivenhed og billedtekst.
    const validVideo = new File(['mp4'], 'ugle.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText('Billedtekst (valgfri)'), {
      target: { value: 'Natugle i træet' },
    })
    fireEvent.change(screen.getByLabelText(/Knyt til begivenhed/), {
      target: { value: 'event1' },
    })
    fireEvent.change(input, { target: { files: [validVideo] } })

    expect(enqueueSpy).toHaveBeenCalledWith({
      files: [validVideo],
      caption: 'Natugle i træet',
      eventId: 'event1',
    })
  })

  it('viser albumcover med videotegn uden miniature og åbner video i lysbordet', () => {
    renderGallery('/billeder')

    // Albumcoveret for video uden thumbnail viser roligt videotegn i stedet for fejl/Intet billede.
    expect(screen.queryByText('Intet billede klar endnu')).toBeNull()
    expect(screen.getByText('Video')).toBeTruthy()

    // Åbn albummet og se både miniature med videotegn og video uden miniature.
    fireEvent.click(
      screen.getByRole('button', { name: /^Åbn album: Uden begivenhed,/ }),
    )

    const thumbBtn = screen.getByRole('button', {
      name: 'Åbn video: Bækken i skoven',
    })
    expect(thumbBtn.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.convex.site/photo?token=vid1-thumb',
    )

    const noThumbBtn = screen.getByRole('button', {
      name: 'Åbn video uden billedtekst',
    })
    expect(noThumbBtn.querySelector('img')).toBeNull()
    expect(noThumbBtn.textContent).toContain('Video')
    expect(screen.queryByText('Billedet kunne ikke hentes')).toBeNull()

    // Klik på video åbner lysbord med HTML5 <video controls playsInline>.
    fireEvent.click(thumbBtn)
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    expect(video?.hasAttribute('controls')).toBe(true)
    expect(video?.hasAttribute('playsinline')).toBe(true)
    expect(video?.getAttribute('src')).toBe(
      'https://example.convex.site/video?token=vid1',
    )
  })

  it('lader medlemmet masseflytte videoer og billeder samlet med "Flyt flere billeder"', async () => {
    mockState.photos = [
      makeItem('p1', { mediaKind: 'image', caption: 'Foto 1' }),
      makeItem('v1', {
        mediaKind: 'video',
        caption: 'Video 1',
        displayUrl: 'https://example.convex.site/video?token=vid1',
        thumbnailUrl: null,
      }),
    ]
    renderGallery('/billeder?album=without-event')

    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Foto 1' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vælg video: Video 1' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Begivenhed' }), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt 2 billeder' }))

    await waitFor(() =>
      expect(movePhotosSpy).toHaveBeenCalledWith({
        photoIds: ['p1', 'v1'],
        eventId: 'event1',
      }),
    )
  })
})
