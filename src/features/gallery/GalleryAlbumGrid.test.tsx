import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GalleryAlbumGrid } from './GalleryAlbumGrid'
import type { GalleryAlbum } from './useGalleryAlbums'

vi.mock('../../lib/supabaseClient', () => ({
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

function album(overrides: Partial<GalleryAlbum> = {}): GalleryAlbum {
  return {
    albumId: 'event-1',
    eventId: 'event-1',
    title: 'Skovtur',
    eventDate: '2026-08-20T12:00:00.000Z',
    photoCount: 3,
    cover: {
      photoId: 'photo-1',
      thumbnailPath: 'photo-1-thumb.jpg',
      optimizedPath: 'photo-1.jpg',
      storagePath: 'member/photo-1.jpg',
    },
    ...overrides,
  }
}

afterEach(cleanup)

describe('GalleryAlbumGrid', () => {
  it('shows the album title, count and date in the accessible name', () => {
    render(<GalleryAlbumGrid albums={[album()]} onOpenAlbum={vi.fn()} />)

    expect(
      screen.getByRole('button', {
        name: /Åbn album: Skovtur, 3 billeder · 20\. aug\. 2026/,
      }),
    ).toBeTruthy()
  })

  it('shows a placeholder when no photo is optimised yet', () => {
    render(
      <GalleryAlbumGrid
        albums={[album({ cover: null })]}
        onOpenAlbum={vi.fn()}
      />,
    )

    expect(screen.getByText('Intet billede klar endnu')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the singular photo count', () => {
    render(
      <GalleryAlbumGrid
        albums={[album({ photoCount: 1, eventDate: null })]}
        onOpenAlbum={vi.fn()}
      />,
    )

    expect(screen.getByText('1 billede')).toBeTruthy()
  })

  it('has no date for the "without event" album', () => {
    render(
      <GalleryAlbumGrid
        albums={[
          album({
            albumId: 'without-event',
            eventId: null,
            title: 'Uden begivenhed',
            eventDate: null,
            photoCount: 2,
          }),
        ]}
        onOpenAlbum={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'Åbn album: Uden begivenhed, 2 billeder',
      }),
    ).toBeTruthy()
  })

  it('opens the album that was clicked', () => {
    const onOpenAlbum = vi.fn()
    const first = album()
    const second = album({
      albumId: 'event-2',
      eventId: 'event-2',
      title: 'Fugletur',
    })
    render(
      <GalleryAlbumGrid albums={[first, second]} onOpenAlbum={onOpenAlbum} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Fugletur/ }))
    expect(onOpenAlbum).toHaveBeenCalledWith(second)
  })
})
