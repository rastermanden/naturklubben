import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from './types'

const display = vi.hoisted(() => ({
  url: 'https://example.test/thumbnail.jpg' as string | undefined,
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
}))

vi.mock('./useDisplayUrl', () => ({
  useDisplayUrl: () => display,
}))

import { PhotoThumbnail } from './PhotoThumbnail'

function photo(caption: string | null): Photo {
  return {
    id: 'photo-1',
    storage_path: 'member/photo-1.jpg',
    optimized_path: 'photo-1.jpg',
    thumbnail_path: 'photo-1-thumbnail.jpg',
    caption,
    event_id: null,
    event: null,
    uploaded_by: 'member-id',
    created_at: '2026-08-23T12:00:00.000Z',
    optimization_status: 'ready',
    optimization_attempts: 1,
    optimization_started_at: '2026-08-23T12:00:00.000Z',
    optimization_completed_at: '2026-08-23T12:01:00.000Z',
    optimization_error: null,
  }
}

afterEach(cleanup)

describe('PhotoThumbnail', () => {
  beforeEach(() => {
    display.url = 'https://example.test/thumbnail.jpg'
    display.error = null
    display.refetch.mockReset()
  })

  it('uses the caption in the button name', () => {
    render(<PhotoThumbnail photo={photo('Bål ved søen')} onClick={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'Åbn billede: Bål ved søen' }),
    ).toBeTruthy()
  })

  it('provides a meaningful button name without a caption', () => {
    render(<PhotoThumbnail photo={photo(null)} onClick={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'Åbn billede uden billedtekst' }),
    ).toBeTruthy()
  })

  it('names the retry action when the image failed to load', () => {
    display.url = undefined
    display.error = new Error('Kunne ikke hente billedet')
    render(<PhotoThumbnail photo={photo('Bål ved søen')} onClick={vi.fn()} />)

    expect(
      screen.getByRole('button', {
        name: 'Prøv at hente billedet "Bål ved søen" igen',
      }),
    ).toBeTruthy()
  })
})
