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
    albumId: 'event1',
    eventId: 'event1',
    title: 'Hornfisketur',
    photoCount: 2,
    latestPhotoAt: 2,
    coverPhotoId: null,
    coverUrl: null,
  },
]

const enqueue = vi.fn()

vi.mock('convex/react', () => ({
  useQuery: (_query: unknown, args: unknown) =>
    args === 'skip' ? undefined : albums,
  usePaginatedQuery: () => ({
    results: [],
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
    onChange,
  }: {
    value: string
    onChange: (eventId: string) => void
  }) => (
    <label>
      Knyt til begivenhed (valgfri)
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Ingen</option>
        <option value="event1">Hornfisketur</option>
        <option value="event2">Fugletårnet</option>
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
  fireEvent.change(screen.getByLabelText('Vælg billeder fra enheden'), {
    target: { files: [file] },
  })
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

    fireEvent.change(picker(), { target: { value: '' } })
    chooseFile()

    expect(enqueue.mock.calls[0][0]).toMatchObject({ eventId: null })
  })
})
