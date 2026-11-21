import { describe, expect, it, vi } from 'vitest'

vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}))

import { badgePrintGeometry } from './badgePrint'
import { BadgeUserFacingError } from './badgeErrors'
import { renderBadgePrintFile } from './renderBadgePrint'
import { badgeErrorMessage } from './useBadges'

describe('badgePrintGeometry', () => {
  it('beregner trykfilens mål og skæreradius for 58 mm + 5 mm bleed', () => {
    const geometry = badgePrintGeometry({
      imageWidth: 1200,
      imageHeight: 1200,
      cropX: 100,
      cropY: 100,
      cropSize: 1000,
      diameterMm: 58,
      bleedMm: 5,
    })

    expect(geometry.printPx).toBe(Math.round((68 / 25.4) * 300))
    expect(geometry.cutRadiusPx).toBeCloseTo(
      (geometry.printPx * (58 / 68)) / 2,
      5,
    )
    expect(geometry.needsEdgeFill).toBe(false)
  })

  it('markerer needsEdgeFill når bleed rækker uden for billedkanten', () => {
    const geometry = badgePrintGeometry({
      imageWidth: 1000,
      imageHeight: 1000,
      cropX: 0,
      cropY: 0,
      cropSize: 1000,
      diameterMm: 58,
      bleedMm: 5,
    })

    expect(geometry.needsEdgeFill).toBe(true)
  })
})

describe('renderBadgePrintFile', () => {
  it('tegner trykfilen som PNG med hvid baggrund, bleed-fyld, skærelinje og lukker bitmap', async () => {
    let closed = false
    const drawCalls: number[][] = []
    let arcCalls = 0
    const original = globalThis.OffscreenCanvas

    class FakeCanvas {
      width: number
      height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext() {
        return {
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          fillRect: () => undefined,
          drawImage: (_src: unknown, ...nums: number[]) => {
            drawCalls.push(nums)
          },
          save: () => undefined,
          restore: () => undefined,
          beginPath: () => undefined,
          arc: () => {
            arcCalls += 1
          },
          stroke: () => undefined,
          setLineDash: () => undefined,
        }
      }
      async convertToBlob(options?: { type?: string }) {
        return new Blob(['png-bytes'], { type: options?.type ?? 'image/png' })
      }
    }

    globalThis.OffscreenCanvas = FakeCanvas as unknown as typeof OffscreenCanvas
    try {
      const output = await renderBadgePrintFile(
        new Blob(['src'], { type: 'image/png' }),
        {
          cropX: 0,
          cropY: 0,
          cropSize: 1000,
          diameterMm: 58,
          bleedMm: 5,
        },
        async () => ({
          width: 1000,
          height: 1000,
          close: () => {
            closed = true
          },
        }),
      )

      expect(output.type).toBe('image/png')
      expect(drawCalls).toHaveLength(2)
      expect(arcCalls).toBe(2)
      expect(closed).toBe(true)
    } finally {
      globalThis.OffscreenCanvas = original
    }
  })

  it('kaster BadgeUserFacingError når beskæringen ligger uden for billedet så badgeErrorMessage bevarer teksten', async () => {
    let caught: unknown
    try {
      await renderBadgePrintFile(
        new Blob(['src'], { type: 'image/png' }),
        {
          cropX: 2000,
          cropY: 0,
          cropSize: 200,
          diameterMm: 58,
          bleedMm: 5,
        },
        async () => ({
          width: 1000,
          height: 1000,
        }),
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BadgeUserFacingError)
    expect(badgeErrorMessage(caught)).toBe(
      'Beskæringen ligger uden for billedet. Vælg udsnittet igen.',
    )
  })

  it('kaster BadgeUserFacingError når 2D-kontekst mangler', async () => {
    const original = globalThis.OffscreenCanvas
    class BrokenCanvas {
      getContext() {
        return null
      }
    }
    globalThis.OffscreenCanvas =
      BrokenCanvas as unknown as typeof OffscreenCanvas
    try {
      let caught: unknown
      try {
        await renderBadgePrintFile(
          new Blob(['src'], { type: 'image/png' }),
          {
            cropX: 0,
            cropY: 0,
            cropSize: 1000,
            diameterMm: 58,
            bleedMm: 5,
          },
          async () => ({
            width: 1000,
            height: 1000,
          }),
        )
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(BadgeUserFacingError)
      expect(badgeErrorMessage(caught)).toBe(
        'Trykfilen kunne ikke tegnes i browseren.',
      )
    } finally {
      globalThis.OffscreenCanvas = original
    }
  })
})
