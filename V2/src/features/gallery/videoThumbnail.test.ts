import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureVideoThumbnail } from './videoThumbnail'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('captureVideoThumbnail', () => {
  it('fanger et skaleret JPEG-stillbillede fra første videoframe og rydder op', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:video-test')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    const videoEl = document.createElement('video')
    Object.defineProperty(videoEl, 'videoWidth', {
      value: 1600,
      configurable: true,
    })
    Object.defineProperty(videoEl, 'videoHeight', {
      value: 800,
      configurable: true,
    })
    Object.defineProperty(videoEl, 'readyState', {
      value: 2,
      configurable: true,
    })
    vi.spyOn(videoEl, 'load').mockImplementation(() => {
      queueMicrotask(() => {
        videoEl.dispatchEvent(new Event('loadeddata'))
      })
    })

    const drawnSizes: Array<{ width: number; height: number }> = []
    const canvasEl = document.createElement('canvas')
    vi.spyOn(canvasEl, 'getContext').mockReturnValue({
      drawImage: (
        _img: unknown,
        _x: number,
        _y: number,
        w: number,
        h: number,
      ) => {
        drawnSizes.push({ width: w, height: h })
      },
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(canvasEl, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['jpeg-thumb'], { type: 'image/jpeg' }))
    })

    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string) => {
        if (tagName === 'video') return videoEl
        if (tagName === 'canvas') return canvasEl
        return origCreateElement(tagName)
      },
    )

    const result = await captureVideoThumbnail(
      new Blob(['mp4'], { type: 'video/mp4' }),
    )

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:video-test')
    expect(result).not.toBeNull()
    expect(result?.width).toBe(400)
    expect(result?.height).toBe(200)
    expect(result?.blob.type).toBe('image/jpeg')
    expect(drawnSizes).toEqual([{ width: 400, height: 200 }])
  })

  it('returnerer null uden fejl hvis videoen ikke kan afkodes', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-broken')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    const videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'load').mockImplementation(() => {
      queueMicrotask(() => {
        videoEl.dispatchEvent(new Event('error'))
      })
    })

    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string) => {
        if (tagName === 'video') return videoEl
        return origCreateElement(tagName)
      },
    )

    const result = await captureVideoThumbnail(
      new Blob(['broken'], { type: 'video/quicktime' }),
    )

    expect(result).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:video-broken')
  })
})
