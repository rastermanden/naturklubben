import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BadgeCatalogSection } from './BadgeCatalogSection'
import {
  useBadges,
  useRenderBadgePrint,
  useSetBadgeActive,
  type PrintRenderResult,
} from './useBadges'
import type { Badge } from './types'

// Hele modulet mockes: testen handler om, hvad admin får at vide om trykfilen,
// ikke om Supabase-kaldene bag den.
vi.mock('./useBadges', () => ({
  badgeImageUrl: (path: string) => `https://example.test/${path}`,
  BADGE_IMAGE_MIME_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  MAX_BADGE_IMAGE_SIZE: 10 * 1024 * 1024,
  useBadges: vi.fn(),
  useRenderBadgePrint: vi.fn(),
  useSetBadgeActive: vi.fn(),
  useSaveBadge: vi.fn(),
}))

const badge: Badge = {
  id: 'badge-1',
  slug: 'bonderoeven',
  name: 'Bonderøven',
  description: null,
  image_path: 'badge-1/original.png',
  image_width: 1200,
  image_height: 1200,
  image_mime_type: 'image/png',
  crop_x: 0,
  crop_y: 0,
  crop_size: 1200,
  diameter_mm: 58,
  bleed_mm: 5,
  print_path: null,
  print_status: 'pending',
  print_error: null,
  print_started_at: null,
  is_active: true,
  created_at: '2026-08-26T10:00:00.000Z',
  updated_at: '2026-08-26T10:00:00.000Z',
}

const renderPrint = vi.fn()

function mockQueries(printStatus: Badge['print_status'] = 'pending') {
  vi.mocked(useBadges).mockReturnValue({
    data: [
      {
        ...badge,
        print_status: printStatus,
        print_path:
          printStatus === 'ready' ? 'badge-1/print-1.png' : badge.print_path,
      },
    ],
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
  } as unknown as ReturnType<typeof useBadges>)

  vi.mocked(useRenderBadgePrint).mockReturnValue({
    mutateAsync: renderPrint,
    isPending: false,
  } as unknown as ReturnType<typeof useRenderBadgePrint>)

  vi.mocked(useSetBadgeActive).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSetBadgeActive>)
}

function resolveWith(status: PrintRenderResult['status']) {
  renderPrint.mockResolvedValue({
    status,
    printPath: status === 'ready' ? 'badge-1/print-1.png' : null,
  } satisfies PrintRenderResult)
}

beforeEach(() => {
  mockQueries()
  resolveWith('ready')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BadgeCatalogSection', () => {
  it('melder først trykfilen som lavet, når functionen siger ready', async () => {
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Lav trykfilen' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'Trykfilen til Bonderøven er lavet.',
    )
  })

  it('lyver ikke, når renderingen stadig er i gang', async () => {
    // 202 fra functionen: en anden rendering har allerede claimet badgen.
    // Meldte vi "er lavet" her, ville admin lede efter en fil, der ikke findes.
    resolveWith('rendering')
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Lav trykfilen' }))

    expect((await screen.findByRole('status')).textContent).toMatch(
      /er i gang\. Listen opdaterer sig selv/,
    )
  })

  it('åbner trykfilen i en ny fane', () => {
    // download-attributten virkede alligevel ikke: filen ligger på Supabases
    // eget domæne, og browsere ignorerer download på tværs af origins. Linket
    // sendte derfor admin væk fra panelet og hen på PNG'en.
    mockQueries('ready')
    render(<BadgeCatalogSection />)

    const link = screen.getByRole('link', { name: 'Hent trykfil' })

    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('viser functionens egen forklaring, når renderingen fejler', async () => {
    renderPrint.mockRejectedValue(
      new (await import('./badgeErrors')).BadgeUserFacingError(
        'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
      ),
    )
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Lav trykfilen' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
    )
  })
})
