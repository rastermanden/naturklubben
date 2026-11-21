import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state: {
  events: { id: string; title: string; startAt: number }[] | undefined
} = { events: undefined }

vi.mock('convex/react', () => ({
  useQuery: () => state.events,
  useMutation: () => vi.fn(),
}))

// Kommentarerne er deres egen sag; de hører ikke til denne test.
vi.mock('./PhotoComments', () => ({ PhotoComments: () => null }))

import { MovePhotoField } from './MovePhotoField'
import { PhotoLightbox } from './PhotoLightbox'
import type { Photo } from './types'

afterEach(cleanup)

const photo: Photo = {
  id: 'photo1',
  caption: null,
  eventId: null,
  albumKey: 'without-event',
  uploaderId: 'p1',
  createdAt: 1,
  width: null,
  height: null,
  optimizationStatus: 'ready',
  optimizationAttempts: 0,
  optimizationStartedAt: null,
  optimizationError: null,
  commentCount: 0,
  canDelete: true,
  isUploader: true,
  displayUrl: 'https://example.convex.cloud/api/storage/et',
  thumbnailUrl: 'https://example.convex.cloud/api/storage/et',
}

const tur = {
  id: 'event1',
  title: 'Hornfisketur',
  startAt: Date.UTC(2026, 5, 14),
}
const andenTur = {
  id: 'event2',
  title: 'Fugletårnet',
  startAt: Date.UTC(2026, 4, 2),
}

/** Lysbordet med det, flytningen har brug for; resten er uden betydning her. */
function lightboxProps(
  photo: Photo,
  onMove: (photo: Photo, eventId: string | null) => void,
) {
  return {
    photo,
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onRetryOptimization: vi.fn(),
    onMove,
    deleting: false,
    retrying: false,
    actionError: null,
  }
}

function field() {
  return screen.getByLabelText(/Knyt til begivenhed/) as HTMLSelectElement
}

describe('MovePhotoField', () => {
  it('flytter et billede uden begivenhed til den valgte tur', () => {
    state.events = [tur, andenTur]
    const onMove = vi.fn()
    render(<MovePhotoField photo={photo} moving={false} onMove={onMove} />)

    // Ingen knap, før man har valgt noget andet: der er intet at flytte til.
    expect(screen.queryByRole('button')).toBeNull()

    fireEvent.change(field(), { target: { value: 'event2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt billedet' }))

    expect(onMove).toHaveBeenCalledWith(photo, 'event2')
  })

  it('flytter væk fra turen, når man vælger "Ingen"', () => {
    state.events = [tur]
    const onMove = vi.fn()
    const påTur = { ...photo, eventId: 'event1', albumKey: 'event1' }
    render(
      <MovePhotoField
        photo={påTur}
        currentTitle="Hornfisketur"
        moving={false}
        onMove={onMove}
      />,
    )

    // Billedets nuværende tur er valgt fra starten.
    expect(field().value).toBe('event1')

    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Flyt til Uden begivenhed' }),
    )

    expect(onMove).toHaveBeenCalledWith(påTur, null)
  })

  it('flytter ikke af sig selv, når man kun rører feltet', () => {
    // En flytning, der skete ved at røre feltet, ville være for let at lave
    // ved et uheld -- og den flytter et billede, andre leder efter.
    state.events = [tur, andenTur]
    const onMove = vi.fn()
    render(<MovePhotoField photo={photo} moving={false} onMove={onMove} />)

    fireEvent.change(field(), { target: { value: 'event1' } })

    expect(onMove).not.toHaveBeenCalled()
  })

  it('viser ingen knap, når valget er tilbage på billedets egen tur', () => {
    state.events = [tur, andenTur]
    const påTur = { ...photo, eventId: 'event1', albumKey: 'event1' }
    render(<MovePhotoField photo={påTur} moving={false} onMove={vi.fn()} />)

    fireEvent.change(field(), { target: { value: 'event2' } })
    expect(screen.getByRole('button', { name: 'Flyt billedet' })).toBeTruthy()

    fireEvent.change(field(), { target: { value: 'event1' } })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('siger det, mens flytningen er i gang, og kan ikke trykkes to gange', () => {
    state.events = [tur]
    render(<MovePhotoField photo={photo} moving={true} onMove={vi.fn()} />)

    fireEvent.change(field(), { target: { value: 'event1' } })
    const button = screen.getByRole('button', {
      name: 'Flytter…',
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})

describe('MovePhotoField gennem lysbordet', () => {
  it('tager ikke valget med over til næste billede', () => {
    // Uden en nulstilling pr. billede ville et valg truffet for billede 1
    // stå klar, når man bladrer -- og så er billede 2 ét tryk fra at blive
    // flyttet til en tur, der blev valgt for et andet billede. Det er lige
    // den fejl, kravet om et tryk skal forhindre.
    state.events = [tur, andenTur]
    const onMove = vi.fn()
    const et = { ...photo, id: 'photo1' }
    const to = { ...photo, id: 'photo2', eventId: 'event1', albumKey: 'event1' }

    const view = render(<PhotoLightbox {...lightboxProps(et, onMove)} />)
    fireEvent.change(field(), { target: { value: 'event2' } })
    expect(screen.getByRole('button', { name: 'Flyt billedet' })).toBeTruthy()

    view.rerender(<PhotoLightbox {...lightboxProps(to, onMove)} />)

    // Feltet viser billede 2's egen tur, og der er intet at trykke på.
    expect(field().value).toBe('event1')
    expect(screen.queryByRole('button', { name: 'Flyt billedet' })).toBeNull()
    expect(onMove).not.toHaveBeenCalled()
  })
})
