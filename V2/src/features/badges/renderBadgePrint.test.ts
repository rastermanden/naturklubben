import { describe, expect, it } from 'vitest'
import { badgePrintGeometry } from './badgePrint'
import { renderBadgePrintFile } from './renderBadgePrint'

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
})
