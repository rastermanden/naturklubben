import { describe, expect, it } from 'vitest'
import { avatarOutputSize, resizeAvatarFile } from './resizeAvatar'

describe('avatarOutputSize', () => {
  it('beholder sma billeder og skalerer den lange side ned til 512', () => {
    expect(avatarOutputSize(200, 100)).toEqual({ width: 200, height: 100 })
    expect(avatarOutputSize(2000, 1000)).toEqual({ width: 512, height: 256 })
    expect(avatarOutputSize(1000, 4000)).toEqual({ width: 128, height: 512 })
  })
})

describe('resizeAvatarFile', () => {
  it('afviser noget, der ikke er et billede, for dekoderen kores', async () => {
    await expect(
      resizeAvatarFile(
        new Blob(['tekst'], { type: 'text/plain' }),
        async () => {
          throw new Error('skulle ikke dekode')
        },
      ),
    ).rejects.toThrow('AVATAR_NOT_AN_IMAGE')
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
            x: number,
            y: number,
            width: number,
            height: number,
          ) => {
            drawn.push(x, y, width, height)
          },
        }
      }
      async convertToBlob() {
        return new Blob(['jpeg'], { type: 'image/jpeg' })
      }
    }
    globalThis.OffscreenCanvas = FakeCanvas as unknown as typeof OffscreenCanvas
    try {
      const blob = await resizeAvatarFile(
        new Blob(['billede'], { type: 'image/png' }),
        async () => ({
          width: 1000,
          height: 500,
          close: () => {
            closed = true
          },
        }),
      )
      expect(blob.type).toBe('image/jpeg')
      expect(drawn).toEqual([0, 0, 512, 256])
      expect(closed).toBe(true)
    } finally {
      globalThis.OffscreenCanvas = original
    }
  })
})
