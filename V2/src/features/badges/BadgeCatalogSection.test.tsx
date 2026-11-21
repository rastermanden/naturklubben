import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'
import type { AdminBadge } from './types'
import {
  BadgeUserFacingError,
  useAdminBadgeCatalog,
  useRenderBadgePrint,
  useSaveBadge,
  useSetBadgeActive,
  type PrintRenderResult,
} from './useBadges'
import { BadgeCatalogSection } from './BadgeCatalogSection'

vi.mock('./useBadges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useBadges')>()
  return {
    ...actual,
    useAdminBadgeCatalog: vi.fn(),
    useRenderBadgePrint: vi.fn(),
    useSetBadgeActive: vi.fn(),
    useSaveBadge: vi.fn(),
  }
})

const sampleBadge: AdminBadge = {
  _id: 'badge-1' as Id<'badges'>,
  slug: 'skovmaerke',
  name: 'Skovmærke',
  description: 'Til medlemmer der finder vej i skoven.',
  imageStorageId: 'storage-1' as Id<'_storage'>,
  imageUrl: 'https://example.test/skovmaerke.png',
  imageWidth: 1200,
  imageHeight: 1200,
  imageMimeType: 'image/png',
  cropX: 0,
  cropY: 0,
  cropSize: 1200,
  diameterMm: 58,
  bleedMm: 5,
  printStorageId: undefined,
  printUrl: null,
  printStatus: 'pending',
  printError: undefined,
  printStartedAt: undefined,
  printCompletedAt: undefined,
  printAttempts: 0,
  isActive: true,
  createdAt: 1000,
  updatedAt: 1000,
  awardedCount: 0,
}

const renderPrint = vi.fn()
const saveBadge = vi.fn()
const setActive = vi.fn()

function mockCatalog(
  badges: AdminBadge[] = [sampleBadge],
  overrides: Partial<AdminBadge> = {},
) {
  vi.mocked(useAdminBadgeCatalog).mockReturnValue(
    badges.map((badge) => ({ ...badge, ...overrides })),
  )
  vi.mocked(useRenderBadgePrint).mockReturnValue({
    renderPrint,
    isPending: false,
  })
  vi.mocked(useSetBadgeActive).mockReturnValue({
    setActive,
    isPending: false,
  })
  vi.mocked(useSaveBadge).mockReturnValue({
    saveBadge,
    isPending: false,
  })
}

function resolveRenderWith(status: PrintRenderResult['status']) {
  renderPrint.mockResolvedValue({
    status,
    printUrl:
      status === 'ready' ? 'https://example.test/badge-1/print-1.png' : null,
  } satisfies PrintRenderResult)
}

const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL
const originalImage = globalThis.Image

beforeEach(() => {
  mockCatalog()
  resolveRenderWith('ready')
  saveBadge.mockResolvedValue({
    id: 'badge-new' as Id<'badges'>,
    renderStarted: true,
  })
  setActive.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  URL.createObjectURL = originalCreateObjectUrl
  URL.revokeObjectURL = originalRevokeObjectUrl
  globalThis.Image = originalImage
})

describe('BadgeCatalogSection', () => {
  it('åbner formularen ved «Ny badge» med standardmål og auto-slug og validerer påkrævet billede', async () => {
    mockCatalog([])
    render(<BadgeCatalogSection />)

    expect(
      screen.getByText(/Der er ingen badges endnu\. Opret den første/),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ny badge' }))

    const nameInput = screen.getByLabelText('Navn') as HTMLInputElement
    const slugInput = screen.getByLabelText('Slug') as HTMLInputElement
    const diameterInput = screen.getByLabelText(
      'Diameter (mm)',
    ) as HTMLInputElement
    const bleedInput = screen.getByLabelText(
      'Beskæringsmargin (mm)',
    ) as HTMLInputElement
    const activeCheckbox = screen.getByLabelText(
      'Kan indstilles til',
    ) as HTMLInputElement

    expect(diameterInput.value).toBe('58')
    expect(bleedInput.value).toBe('5')
    expect(activeCheckbox.checked).toBe(true)

    fireEvent.change(nameInput, { target: { value: 'Søstjernen Å' } })
    expect(slugInput.value).toBe('soestjernen-aa')

    fireEvent.submit(nameInput.closest('form')!)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Vælg et billede. En badge uden billede kan ikke produceres.',
    )
    expect(saveBadge).not.toHaveBeenCalled()
  })

  it('lader admin vælge billede, se beskæring og gemme en ny badge', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview-url')
    URL.revokeObjectURL = vi.fn()
    class FakeImage {
      naturalWidth = 1200
      naturalHeight = 1200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image

    mockCatalog([])
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Ny badge' }))

    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Turmærke' },
    })
    fireEvent.change(screen.getByLabelText('Beskrivelse (valgfri)'), {
      target: { value: 'For ekstra mange ture.' },
    })

    const file = new File(['png-data'], 'turmaerke.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Vælg badgebillede'), {
      target: { files: [file] },
    })

    expect(await screen.findByText('Sådan ser den ud')).toBeTruthy()
    expect(screen.getByLabelText('Zoom')).toBeTruthy()
    expect(screen.getByLabelText('Vandret')).toBeTruthy()
    expect(screen.getByLabelText('Lodret')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Gem badge' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'Turmærke er oprettet. Trykfilen er på vej.',
    )
    expect(saveBadge).toHaveBeenCalledWith({
      badgeId: undefined,
      values: {
        name: 'Turmærke',
        slug: 'turmaerke',
        description: 'For ekstra mange ture.',
        cropX: 0,
        cropY: 0,
        cropSize: 1200,
        diameterMm: 58,
        bleedMm: 5,
        isActive: true,
      },
      image: {
        file,
        width: 1200,
        height: 1200,
      },
    })
  })

  it('kan rette en eksisterende badge uden at kræve nyt billede', async () => {
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Ret' }))

    expect(screen.getByText('Ret Skovmærke')).toBeTruthy()
    const nameInput = screen.getByLabelText('Navn') as HTMLInputElement
    expect(nameInput.value).toBe('Skovmærke')

    fireEvent.change(nameInput, { target: { value: 'Stort Skovmærke' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gem badge' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'Stort Skovmærke er opdateret. Trykfilen laves om.',
    )
    expect(saveBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        badgeId: sampleBadge._id,
        image: undefined,
        values: expect.objectContaining({
          name: 'Stort Skovmærke',
          slug: 'skovmaerke',
        }),
      }),
    )
  })

  it('skifter aktiv-status via Deaktivér og Aktivér', async () => {
    const { rerender } = render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Deaktivér' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'Skovmærke kan ikke længere indstilles til.',
    )
    expect(setActive).toHaveBeenCalledWith({
      badgeId: sampleBadge._id,
      isActive: false,
    })

    mockCatalog([sampleBadge], { isActive: false })
    rerender(<BadgeCatalogSection />)

    expect(screen.getByText('Deaktiveret')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aktivér' }))
    expect((await screen.findByRole('status')).textContent).toBe(
      'Skovmærke kan indstilles til igen.',
    )
    expect(setActive).toHaveBeenCalledWith({
      badgeId: sampleBadge._id,
      isActive: true,
    })
  })

  it('melder først trykfilen som lavet, når svaret siger ready', async () => {
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Lav trykfilen' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'Trykfilen til Skovmærke er lavet.',
    )
  })

  it('lyver ikke, når renderingen stadig er i gang', async () => {
    resolveRenderWith('rendering')
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Lav trykfilen' }))

    expect((await screen.findByRole('status')).textContent).toMatch(
      /er i gang\. Listen opdaterer sig selv/,
    )
  })

  it('åbner trykfilen i en ny fane', () => {
    mockCatalog([sampleBadge], {
      printStatus: 'ready',
      printUrl: 'https://example.test/badge-1/print-1.png',
    })
    render(<BadgeCatalogSection />)

    const link = screen.getByRole('link', { name: 'Hent trykfil' })

    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('viser fejlbeskeden, når renderingen fejler', async () => {
    renderPrint.mockRejectedValue(
      new BadgeUserFacingError(
        'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
      ),
    )
    render(<BadgeCatalogSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Lav trykfilen' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
    )
  })

  it('skifter fra «Trykfilen laves…» til «Trykfilen gik i stå» efter 2 min selv efter inaktivitet', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      mockCatalog([sampleBadge], { printStatus: 'ready' })
      const { rerender } = render(<BadgeCatalogSection />)

      // Simuler 5 minutters inaktivitet før en ny rendering starter.
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000)
      })

      mockCatalog([sampleBadge], {
        printStatus: 'rendering',
        printStartedAt: Date.now(),
      })
      rerender(<BadgeCatalogSection />)

      expect(screen.getByText('Trykfilen laves…')).toBeTruthy()

      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000 + 100)
      })

      expect(screen.getByText('Trykfilen gik i stå')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
