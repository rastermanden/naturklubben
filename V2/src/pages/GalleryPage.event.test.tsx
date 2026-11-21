import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Vælgeren "knyt til begivenhed" (#332), set fra siden: at det valgte id
 * faktisk følger med uploaden, og at et begivenhedsalbum er forvalgt.
 *
 * `EventPicker` er erstattet af en simpel `select` her, så testen handler om
 * sidens ledninger og ikke om Convex-queryen -- den har sin egen test ved
 * siden af komponenten.
 */

const albums = [
  {
    albumId: '7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60',
    eventId: '7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60',
    title: 'Hornfisketur 2024',
    photoCount: 5,
    latestPhotoAt: 1,
    coverPhotoId: null,
    coverUrl: null,
  },
  {
    albumId: 'event1',
    eventId: 'event1',
    title: 'Sommertur',
    photoCount: 2,
    latestPhotoAt: 2,
    coverPhotoId: null,
    coverUrl: null,
  },
]

/** Ét billede er nok til, at albumvisningen og dens "← Alle album" renderes. */
const photo = {
  id: 'photo1',
  mediaKind: 'image' as const,
  caption: null,
  eventId: 'event1',
  albumKey: 'event1',
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
  canEdit: false,
  isUploader: false,
  displayUrl: 'https://example.convex.cloud/api/storage/et',
  thumbnailUrl: 'https://example.convex.cloud/api/storage/et',
}

const enqueue = vi.fn()

vi.mock('convex/react', () => ({
  useQuery: (_query: unknown, args: unknown) =>
    args === 'skip' ? undefined : albums,
  usePaginatedQuery: () => ({
    results: [photo],
    status: 'Exhausted',
    loadMore: vi.fn(),
    isLoading: false,
  }),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}))

vi.mock('../features/gallery/useUploadPhotos', () => ({
  useUploadPhotos: () => ({
    items: [],
    enqueue,
    clearSaved: vi.fn(),
  }),
  validateFiles: () => null,
}))

vi.mock('../features/gallery/useAutoOptimizePendingPhotos', () => ({
  useAutoOptimizePendingPhotos: () => undefined,
}))

vi.mock('../features/gallery/EventPicker', () => ({
  EventPicker: ({
    value,
    valueTitle,
    onChange,
  }: {
    value: string
    valueTitle?: string
    onChange: (eventId: string) => void
  }) => (
    <label>
      Knyt til begivenhed (valgfri)
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Ingen</option>
        <option value="event1">Sommertur</option>
        <option value="event2">Fugletårnet</option>
        {!['', 'event1', 'event2'].includes(value) && (
          <option value={value}>{valueTitle ?? 'Denne begivenhed'}</option>
        )}
      </select>
    </label>
  ),
}))

import GalleryPage from './GalleryPage'

function renderGallery(path = '/billeder') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GalleryPage />
    </MemoryRouter>,
  )
}

function chooseFile() {
  const file = new File(['billede'], 'tur.jpg', { type: 'image/jpeg' })
  fireEvent.change(
    screen.getByLabelText('Vælg billeder og videoer fra enheden'),
    {
      target: { files: [file] },
    },
  )
}

function picker() {
  return screen.getByLabelText(/Knyt til begivenhed/) as HTMLSelectElement
}

beforeEach(() => enqueue.mockClear())
afterEach(cleanup)

describe('GalleryPage: knyt billeder til en begivenhed', () => {
  it('sender den valgte begivenhed med uploaden', () => {
    renderGallery()

    fireEvent.change(picker(), { target: { value: 'event2' } })
    chooseFile()

    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: 'event2' })
  })

  it('uploader uden begivenhed, når feltet står på "Ingen"', () => {
    renderGallery()

    chooseFile()

    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: null })
  })

  it('forvælger albummets begivenhed, når man uploader inde i albummet', () => {
    renderGallery('/billeder?album=event1')

    expect(picker().value).toBe('event1')
    chooseFile()

    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: 'event1' })
  })

  it('lader en anden begivenhed vinde over albummets forvalg', () => {
    renderGallery('/billeder?album=event1')

    fireEvent.change(picker(), { target: { value: 'event2' } })
    chooseFile()

    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: 'event2' })
  })

  it('lader "Ingen" vinde over albummets forvalg', () => {
    renderGallery('/billeder?album=event1')

    fireEvent.change(picker(), { target: { value: '' } })
    chooseFile()

    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: null })
  })

  it('glemmer valget, når man skifter album', () => {
    // Vælger man en begivenhed i ét album, må den ikke følge med over i det
    // næste -- og et "Ingen" må ikke gælde næste gang, man kommer ind i
    // albummet, hvor forvalget skal være albummets egen begivenhed igen.
    renderGallery('/billeder?album=event1')
    fireEvent.change(picker(), { target: { value: '' } })
    expect(picker().value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: /Alle album/ }))
    fireEvent.click(
      screen.getByRole('button', { name: /^Åbn album: Sommertur,/ }),
    )

    expect(picker().value).toBe('event1')
    chooseFile()
    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: 'event1' })
  })

  it('viser albummets nøgle, selv når den ikke er et begivenheds-id (V1-album)', () => {
    // De album, V1-importen lagde ind, har V1's egen UUID som nøgle. Feltet
    // skal vise albummet, ikke "Ingen", og uploaden skal ramme albummet.
    renderGallery('/billeder?album=7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60')

    expect(picker().value).toBe('7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60')
    chooseFile()
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      eventId: '7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60',
    })
  })
})
