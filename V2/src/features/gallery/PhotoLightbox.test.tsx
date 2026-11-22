import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from './types'

const eventsState: {
  events: { id: string; title: string; startAt: number }[] | undefined
} = {
  events: [
    {
      id: 'event1',
      title: 'Hornfisketur',
      startAt: Date.UTC(2026, 5, 14, 10),
    },
    {
      id: 'event2',
      title: 'Fugletårnet',
      startAt: Date.UTC(2026, 6, 2, 10),
    },
  ],
}

vi.mock('convex/react', () => ({
  useQuery: () => eventsState.events,
}))

vi.mock('./PhotoComments', () => ({
  PhotoComments: () => null,
}))

import { PhotoLightbox } from './PhotoLightbox'

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo1',
    mediaKind: 'image',
    caption: 'Morgenlys ved søen',
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
    displayUrl: 'https://example.convex.cloud/photo.jpg',
    thumbnailUrl: 'https://example.convex.cloud/thumb.jpg',
    ...overrides,
  }
}

beforeEach(() => {
  eventsState.events = [
    {
      id: 'event1',
      title: 'Hornfisketur',
      startAt: Date.UTC(2026, 5, 14, 10),
    },
    {
      id: 'event2',
      title: 'Fugletårnet',
      startAt: Date.UTC(2026, 6, 2, 10),
    },
  ]
})

afterEach(cleanup)

describe('PhotoLightbox: redigér billede (#345)', () => {
  it('viser kun "Redigér", når serveren har sat canEdit=true', () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <PhotoLightbox
        photo={makePhoto({ canEdit: false, canDelete: false })}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Redigér' })).toBeNull()

    rerender(
      <PhotoLightbox
        photo={makePhoto({ canEdit: true })}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    expect(screen.getByRole('button', { name: 'Redigér' })).toBeTruthy()
  })

  it('lader brugeren rette eller fjerne billedtekst og vælge begivenhed med dato eller "Ingen begivenhed" og annoncerer gemning (B4)', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    render(
      <PhotoLightbox
        photo={makePhoto({ caption: 'Gammel tekst', eventId: null })}
        albumTitle="Hornfisketur"
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    expect(screen.getByText('I albummet Hornfisketur')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))

    const captionInput = screen.getByLabelText(
      'Billedtekst',
    ) as HTMLInputElement
    const eventSelect = screen.getByLabelText('Begivenhed') as HTMLSelectElement

    expect(captionInput.value).toBe('Gammel tekst')
    expect(eventSelect.value).toBe('')
    expect(
      screen.getByRole('option', { name: 'Ingen begivenhed' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'Hornfisketur (14. jun. 2026)' }),
    ).toBeTruthy()

    fireEvent.change(captionInput, { target: { value: '  Ny tekst  ' } })
    fireEvent.change(eventSelect, { target: { value: 'event1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'photo1' }),
        {
          caption: 'Ny tekst',
          eventId: 'event1',
        },
      ),
    )
    expect(screen.queryByRole('form', { name: 'Redigér billede' })).toBeNull()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Ændringerne er gemt.')
  })

  it('sender null for tom billedtekst og "Ingen begivenhed"', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    render(
      <PhotoLightbox
        photo={makePhoto({
          caption: 'Skal fjernes',
          eventId: 'event1',
          albumKey: 'event1',
        })}
        albumTitle="Hornfisketur"
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))
    fireEvent.change(screen.getByLabelText('Billedtekst'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Begivenhed'), {
      target: { value: '' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Redigér billede' }))

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'photo1' }),
        {
          caption: null,
          eventId: null,
        },
      ),
    )
  })

  it('kan betjenes med tastatur: Escape og baggrundsklik annullerer redigering før lysboksen lukkes', () => {
    const onClose = vi.fn()
    render(
      <PhotoLightbox
        photo={makePhoto()}
        onClose={onClose}
        onEdit={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    const editBtn = screen.getByRole('button', { name: 'Redigér' })
    fireEvent.click(editBtn)
    const captionInput = screen.getByLabelText('Billedtekst')
    expect(document.activeElement).toBe(captionInput)

    // Første Escape lukker redigeringsformularen og flytter fokus tilbage til "Redigér".
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('form', { name: 'Redigér billede' })).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Redigér' }),
    )

    // Baggrundsklik under redigering annullerer også kun redigeringen, ikke lysboksen (B2).
    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('form', { name: 'Redigér billede' })).toBeNull()

    // Anden Escape lukker selve lysboksen.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignorerer Escape og baggrundsklik og låser felter under gemning, så fejl stadig vises (B2, B7)', async () => {
    let rejectEdit: (reason?: unknown) => void = () => {}
    const onEdit = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectEdit = reject
        }),
    )
    const onClose = vi.fn()

    render(
      <PhotoLightbox
        photo={makePhoto()}
        onClose={onClose}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))

    expect(
      (screen.getByLabelText('Billedtekst') as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByLabelText('Begivenhed') as HTMLSelectElement).disabled,
    ).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('form', { name: 'Redigér billede' })).toBeTruthy()

    rejectEdit({ data: 'PHOTO_EVENT_NOT_FOUND', message: 'Server Error' })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Begivenheden findes ikke længere. Vælg en anden.',
    )
    expect(screen.getByRole('form', { name: 'Redigér billede' })).toBeTruthy()
  })

  it('har berøringsvenlige trykflader på mobil og bladrer ikke ved swipe under redigering', () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    render(
      <PhotoLightbox
        photo={makePhoto()}
        onClose={vi.fn()}
        onEdit={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    )

    const editButton = screen.getByRole('button', { name: 'Redigér' })
    expect(editButton.className).toContain('min-h-11')

    fireEvent.click(editButton)

    const dialog = screen.getByRole('dialog')
    const saveButton = screen.getByRole('button', { name: 'Gem' })
    const cancelButton = screen.getByRole('button', { name: 'Annullér' })
    const captionInput = screen.getByLabelText('Billedtekst')
    const eventSelect = screen.getByLabelText('Begivenhed')

    for (const control of [
      saveButton,
      cancelButton,
      captionInput,
      eventSelect,
    ]) {
      expect(control.className).toContain('min-h-11')
    }

    // Swipe må ikke bladre væk midt i en redigering på mobil.
    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 50, clientY: 100 }],
    })
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it('viser dansk fejlbesked og beholder formularen åben, hvis gem fejler', async () => {
    const onEdit = vi
      .fn()
      .mockRejectedValue({ data: 'NOT_PHOTO_OWNER', message: 'Server Error' })

    render(
      <PhotoLightbox
        photo={makePhoto()}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Du kan kun ændre dine egne billeder.')
    expect(screen.getByRole('form', { name: 'Redigér billede' })).toBeTruthy()
  })
})

describe('PhotoLightbox: videoafspilning og redigering (#365)', () => {
  it('viser HTML5-video med controls, playsInline, poster og lader spolning/piletaster blive i afspilleren', async () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    const onEdit = vi.fn().mockResolvedValue(undefined)

    render(
      <PhotoLightbox
        photo={makePhoto({
          id: 'vid1',
          mediaKind: 'video',
          mimeType: 'video/mp4',
          caption: 'Kano på søen',
          displayUrl: 'https://example.convex.site/video?token=tok1',
          thumbnailUrl: 'https://example.convex.site/photo?token=thumb1',
        })}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    )

    const video = document.querySelector('video') as HTMLVideoElement | null
    expect(video).not.toBeNull()
    expect(video?.hasAttribute('controls')).toBe(true)
    expect(video?.hasAttribute('playsinline')).toBe(true)
    expect(video?.getAttribute('src')).toBe(
      'https://example.convex.site/video?token=tok1',
    )
    expect(video?.getAttribute('poster')).toBe(
      'https://example.convex.site/photo?token=thumb1',
    )

    // Touch-spolning i videoens tidslinje må ikke bladre til næste/forrige.
    fireEvent.touchStart(video!, { touches: [{ clientX: 250, clientY: 120 }] })
    fireEvent.touchEnd(video!, {
      changedTouches: [{ clientX: 50, clientY: 120 }],
    })
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrevious).not.toHaveBeenCalled()

    // Piletaster i fokuseret <video> må heller ikke bladre lysbordet.
    fireEvent.keyDown(video!, { key: 'ArrowRight' })
    expect(onNext).not.toHaveBeenCalled()

    // Redigér virker på videoer med samme billedtekst og begivenhedsvælger.
    fireEvent.click(screen.getByRole('button', { name: 'Redigér' }))
    expect(screen.getByRole('form', { name: 'Redigér video' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Billedtekst'), {
      target: { value: 'Ny videotekst' },
    })
    fireEvent.change(screen.getByLabelText('Begivenhed'), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'vid1' }),
        { caption: 'Ny videotekst', eventId: 'event1' },
      ),
    )
  })

  it('viser forståelig dansk besked ved afspilningsfejl på mov/HEVC og andre videoer', () => {
    const { rerender } = render(
      <PhotoLightbox
        photo={makePhoto({
          id: 'vid-mov',
          mediaKind: 'video',
          mimeType: 'video/quicktime',
          displayUrl: 'https://example.convex.site/video?token=movtok',
          thumbnailUrl: null,
        })}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )

    const movVideo = document.querySelector('video')!
    expect(movVideo.hasAttribute('poster')).toBe(false)
    fireEvent.error(movVideo)
    expect(screen.getByRole('alert').textContent).toContain('mov')
    expect(screen.getByRole('alert').textContent).toContain('Safari')

    rerender(
      <PhotoLightbox
        photo={makePhoto({
          id: 'vid-mp4',
          mediaKind: 'video',
          mimeType: 'video/mp4',
          displayUrl: 'https://example.convex.site/video?token=mp4tok',
          thumbnailUrl: null,
        })}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onRetryOptimization={vi.fn()}
        deleting={false}
        retrying={false}
        actionError={null}
      />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.error(document.querySelector('video')!)
    expect(screen.getByRole('alert').textContent).toBe(
      'Videoen kan ikke afspilles i denne browser. Formatet understøttes måske ikke på denne enhed.',
    )
  })
})
