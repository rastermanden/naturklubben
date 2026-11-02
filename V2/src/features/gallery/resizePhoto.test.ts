import { describe, expect, it } from 'vitest'
import { photoOutputSize, resizePhotoFile } from './resizePhoto'

describe('photoOutputSize', () => {
  it('beholder sma billeder og skalerer den lange side ned', () => {
    expect(photoOutputSize(200, 100, 1600)).toEqual({
      width: 200,
      height: 100,
    })
    expect(photoOutputSize(3200, 1600, 1600)).toEqual({
      width: 1600,
      height: 800,
    })
    expect(photoOutputSize(800, 2000, 400)).toEqual({ width: 160, height: 400 })
  })
})

describe('resizePhotoFile', () => {
  it('afviser noget, der ikke er et billede, for dekoderen kores', async () => {
    await expect(
      resizePhotoFile(
        new Blob(['tekst'], { type: 'text/plain' }),
        1600,
        async () => {
          throw new Error('skulle ikke dekode')
        },
      ),
    ).rejects.toThrow('PHOTO_NOT_AN_IMAGE')
  })

  it('tegner det skalerede billede og lukker bitmapen', async () => {
    let closed = false
    const drawn: number[] = []
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
          drawImage: (
            _bitmap: unknown,
            _x: number,
            _y: number,
            width: number,
            height: number,
          ) => {
            drawn.push(width, height)
          },
        }
      }
      async convertToBlob() {
        return new Blob(['jpeg'], { type: 'image/jpeg' })
      }
    }
    globalThis.OffscreenCanvas = FakeCanvas as unknown as typeof OffscreenCanvas
    try {
      const photo = await resizePhotoFile(
        new Blob(['billede'], { type: 'image/png' }),
        400,
        async () => ({
          width: 800,
          height: 400,
          close: () => {
            closed = true
          },
        }),
      )
      expect(photo.blob.type).toBe('image/jpeg')
      expect(photo).toMatchObject({ width: 400, height: 200 })
      expect(drawn).toEqual([400, 200])
      expect(closed).toBe(true)
    } finally {
      globalThis.OffscreenCanvas = original
    }
  })
})
