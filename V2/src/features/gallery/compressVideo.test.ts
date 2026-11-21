import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_VIDEO_BYTES } from './galleryMedia'
import {
  FALLBACK_VIDEO_BITRATE,
  MAX_VIDEO_BITRATE,
  TARGET_OUTPUT_BYTES,
  VideoCompressionError,
  canCompressVideoInBrowser,
  compressVideoFile,
  compressedFileName,
  computeCompressedDimensions,
  computeCompressionPlan,
  selectRecorderMimeType,
} from './compressVideo'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (HTMLCanvasElement.prototype as { captureStream?: unknown })
    .captureStream
  document.body.innerHTML = ''
})

describe('computeCompressedDimensions', () => {
  it('nedskalerer landskabs- og portrætvideo til maks. 720p med lige dimensioner uden opskalering', () => {
    expect(computeCompressedDimensions(3840, 2160, 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    })
    expect(computeCompressedDimensions(2160, 3840, 1280, 720)).toEqual({
      width: 720,
      height: 1280,
    })
    expect(computeCompressedDimensions(1920, 1080, 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    })
    expect(computeCompressedDimensions(640, 480, 1280, 720)).toEqual({
      width: 640,
      height: 480,
    })
    expect(computeCompressedDimensions(641, 481, 1280, 720)).toEqual({
      width: 640,
      height: 480,
    })
  })
})

describe('computeCompressionPlan', () => {
  it('vælger 720p og begrænset bitrate til korte klip og sænker opløsning/bitrate for længere klip', () => {
    const shortClip = computeCompressionPlan({
      srcWidth: 3840,
      srcHeight: 2160,
      durationSeconds: 20,
      hasAudio: true,
    })
    expect(shortClip).toEqual({
      width: 1280,
      height: 720,
      fps: 30,
      videoBitsPerSecond: MAX_VIDEO_BITRATE,
      audioBitsPerSecond: 128_000,
    })

    const threeMinClip = computeCompressionPlan({
      srcWidth: 1920,
      srcHeight: 1080,
      durationSeconds: 180,
      hasAudio: true,
    })
    expect(threeMinClip).not.toBeNull()
    expect(threeMinClip?.width).toBe(1280)
    expect(threeMinClip?.height).toBe(720)
    const expectedTotal = Math.floor((TARGET_OUTPUT_BYTES * 8) / 180)
    expect(threeMinClip?.videoBitsPerSecond).toBe(expectedTotal - 128_000)

    const tenMinClip = computeCompressionPlan({
      srcWidth: 1920,
      srcHeight: 1080,
      durationSeconds: 600,
      hasAudio: true,
    })
    expect(tenMinClip).not.toBeNull()
    expect(tenMinClip?.fps).toBe(24)
    expect(tenMinClip?.height).toBe(480)
    expect(tenMinClip?.videoBitsPerSecond).toBeLessThan(700_000)

    const oneHourClip = computeCompressionPlan({
      srcWidth: 1920,
      srcHeight: 1080,
      durationSeconds: 3600,
      hasAudio: true,
    })
    expect(oneHourClip).toBeNull()

    const unknownDuration = computeCompressionPlan({
      srcWidth: 1920,
      srcHeight: 1080,
      durationSeconds: null,
      hasAudio: false,
    })
    expect(unknownDuration).toEqual({
      width: 1280,
      height: 720,
      fps: 30,
      videoBitsPerSecond: FALLBACK_VIDEO_BITRATE,
      audioBitsPerSecond: 0,
    })
  })
})

describe('selectRecorderMimeType og compressedFileName', () => {
  it('foretrækker mp4 frem for webm og falder tilbage til webm', () => {
    expect(
      selectRecorderMimeType(
        true,
        (mime) => mime.startsWith('video/mp4') || mime.startsWith('video/webm'),
      ),
    ).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2')

    expect(
      selectRecorderMimeType(false, (mime) => mime === 'video/webm;codecs=vp9'),
    ).toBe('video/webm;codecs=vp9')

    expect(selectRecorderMimeType(true, () => false)).toBeNull()

    expect(compressedFileName('IMG_0042.MOV', 'video/mp4')).toBe('IMG_0042.mp4')
    expect(compressedFileName('tur.mp4', 'video/webm;codecs=vp9')).toBe(
      'tur.webm',
    )
  })
})

function setupCompressionMocks(options?: {
  supportedMimes?: string[]
  videoWidth?: number
  videoHeight?: number
  duration?: number
  failMetadata?: boolean
  recorderMime?: string
  chunkSizes?: number[]
}) {
  const supported = new Set(
    options?.supportedMimes ?? ['video/mp4;codecs=avc1.42E01E', 'video/mp4'],
  )
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:video-input')
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})

  const trackStop = vi.fn()
  const mockStream = {
    getVideoTracks: () => [{ stop: trackStop }],
    getAudioTracks: () => [],
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream

  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    configurable: true,
    value: vi.fn(() => mockStream),
  })

  const videoEl = document.createElement('video')
  Object.defineProperty(videoEl, 'videoWidth', {
    value: options?.videoWidth ?? 1920,
    configurable: true,
  })
  Object.defineProperty(videoEl, 'videoHeight', {
    value: options?.videoHeight ?? 1080,
    configurable: true,
  })
  Object.defineProperty(videoEl, 'duration', {
    value: options?.duration ?? 10,
    configurable: true,
  })
  Object.defineProperty(videoEl, 'readyState', {
    value: 2,
    configurable: true,
  })
  let endedFlag = false
  Object.defineProperty(videoEl, 'ended', {
    get: () => endedFlag,
    configurable: true,
  })

  vi.spyOn(videoEl, 'load').mockImplementation(() => {
    queueMicrotask(() => {
      if (options?.failMetadata) {
        videoEl.dispatchEvent(new Event('error'))
        return
      }
      videoEl.dispatchEvent(new Event('loadedmetadata'))
      videoEl.dispatchEvent(new Event('loadeddata'))
    })
  })
  vi.spyOn(videoEl, 'pause').mockImplementation(() => {})

  const canvasEl = document.createElement('canvas')
  vi.spyOn(canvasEl, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)

  const origCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'video') return videoEl
    if (tagName === 'canvas') return canvasEl
    return origCreateElement(tagName)
  })

  let latestRecorder: MockMediaRecorder | null = null
  const startMock = vi.fn()
  const stopMock = vi.fn()

  class MockMediaRecorder {
    static isTypeSupported = vi.fn((mime: string) => supported.has(mime))
    readonly mimeType: string
    state: RecordingState = 'inactive'
    ondataavailable: ((ev: BlobEvent) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((ev: Event) => void) | null = null

    constructor(_stream: MediaStream, init?: MediaRecorderOptions) {
      this.mimeType = options?.recorderMime ?? init?.mimeType ?? 'video/mp4'
      latestRecorder = this
    }

    start(timeslice?: number) {
      this.state = 'recording'
      startMock(timeslice)
    }

    stop() {
      if (this.state === 'inactive') return
      this.state = 'inactive'
      stopMock()
      queueMicrotask(() => {
        this.onstop?.()
      })
    }
  }

  vi.stubGlobal('MediaRecorder', MockMediaRecorder)

  vi.spyOn(videoEl, 'play').mockImplementation(async () => {
    if (options?.chunkSizes) {
      queueMicrotask(() => {
        for (const size of options.chunkSizes!) {
          const actualBytes = size <= 64 * 1024 ? size : 16
          const blob = new Blob([new Uint8Array(actualBytes)], {
            type: 'video/mp4',
          })
          if (size > actualBytes) {
            Object.defineProperty(blob, 'size', { value: size })
          }
          latestRecorder?.ondataavailable?.({ data: blob } as BlobEvent)
        }
        endedFlag = true
        videoEl.dispatchEvent(new Event('ended'))
      })
    }
  })

  return {
    createObjectURL,
    revokeObjectURL,
    trackStop,
    videoEl,
    startMock,
    stopMock,
    getLatestRecorder: () => latestRecorder,
    markEnded: () => {
      endedFlag = true
      videoEl.dispatchEvent(new Event('ended'))
    },
  }
}

describe('compressVideoFile', () => {
  it('streamer via createObjectURL uden arrayBuffer(), rapporterer fremskridt og rydder op', async () => {
    const env = setupCompressionMocks({
      chunkSizes: [1024, 2048],
    })
    const input = new File(['raw-video'], 'skovtur.MOV', {
      type: 'video/quicktime',
    })
    Object.defineProperty(input, 'size', { value: MAX_VIDEO_BYTES + 5_000_000 })
    const arrayBufferSpy = vi.fn(() => {
      throw new Error('Hele filen må ikke indlæses i RAM')
    })
    Object.defineProperty(input, 'arrayBuffer', { value: arrayBufferSpy })

    const progressEvents: Array<{
      phase: string
      progress: number | null
    }> = []

    const output = await compressVideoFile(input, {
      onProgress: (event) => progressEvents.push(event),
    })

    expect(arrayBufferSpy).not.toHaveBeenCalled()
    expect(env.createObjectURL).toHaveBeenCalledWith(input)
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
    expect(env.trackStop).toHaveBeenCalled()
    expect(document.querySelector('video')).toBeNull()
    expect(output.name).toBe('skovtur.mp4')
    expect(output.type).toBe('video/mp4')
    expect(output.size).toBe(3072)
    expect(progressEvents.some((p) => p.phase === 'preparing')).toBe(true)
    expect(progressEvents.some((p) => p.phase === 'compressing')).toBe(true)
    expect(progressEvents.at(-1)).toEqual({
      phase: 'compressing',
      progress: 1,
    })
  })

  it('afbryder optagelse og rydder op når AbortSignal annulleres', async () => {
    const env = setupCompressionMocks()
    const controller = new AbortController()
    const input = new File(['raw'], 'lang.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input, { signal: controller.signal })

    await vi.waitFor(() => {
      expect(env.startMock).toHaveBeenCalledTimes(1)
    })
    controller.abort()

    await expect(promise).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'CANCELLED',
    })
    expect(env.stopMock).toHaveBeenCalledTimes(1)
    expect(env.trackStop).toHaveBeenCalled()
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
  })

  it('afviser med DECODE_FAILED når browseren ikke kan læse videoen', async () => {
    const env = setupCompressionMocks({ failMetadata: true })
    const input = new File(['bad'], 'hevc.mov', { type: 'video/quicktime' })

    await expect(compressVideoFile(input)).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'DECODE_FAILED',
    })
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
  })

  it('afviser med STILL_TOO_LARGE så snart strømmen overstiger 50 MB', async () => {
    const env = setupCompressionMocks({
      chunkSizes: [MAX_VIDEO_BYTES + 1024],
    })
    const input = new File(['huge'], 'megetlang.mp4', { type: 'video/mp4' })

    await expect(compressVideoFile(input)).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'STILL_TOO_LARGE',
    })
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
    expect(env.trackStop).toHaveBeenCalled()
  })

  it('afviser med TOO_LONG når klippet er for langt til at komme under 50 MB', async () => {
    const env = setupCompressionMocks({ duration: 3600 })
    const input = new File(['long'], 'timeslang.mp4', { type: 'video/mp4' })

    await expect(compressVideoFile(input)).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'TOO_LONG',
    })
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
  })

  it('opdager manglende browserstøtte og kaster UNSUPPORTED_BROWSER uden stille fejl', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(canCompressVideoInBrowser()).toBe(false)

    const input = new File(['raw'], 'film.mp4', { type: 'video/mp4' })
    let caught: unknown
    try {
      await compressVideoFile(input)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(VideoCompressionError)
    expect((caught as VideoCompressionError).code).toBe('UNSUPPORTED_BROWSER')
    expect((caught as Error).message).toContain(
      'din browser kan ikke komprimere videoer',
    )
  })
})
