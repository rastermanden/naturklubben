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
  delete (document as { hidden?: unknown }).hidden
  delete (document as { visibilityState?: unknown }).visibilityState
  delete (navigator as { wakeLock?: unknown }).wakeLock
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

interface MockAudioContextHandle {
  ctx: AudioContext
  connectSpy: ReturnType<typeof vi.fn>
  closeSpy: ReturnType<typeof vi.fn>
  resumeSpy: ReturnType<typeof vi.fn>
  audioTrackStopSpy: ReturnType<typeof vi.fn>
  destinationNode: { id: string }
}

function createMockAudioContext(
  initialState: AudioContextState = 'running',
  stateAfterResume: AudioContextState = 'running',
): MockAudioContextHandle {
  let state: AudioContextState = initialState
  const connectSpy = vi.fn()
  const disconnectSpy = vi.fn()
  const audioTrackStopSpy = vi.fn()
  const destinationNode = { id: 'speaker-destination' }

  const resumeSpy = vi.fn(async () => {
    state = stateAfterResume
  })
  const closeSpy = vi.fn(async () => {
    state = 'closed'
  })

  const ctx = {
    get state() {
      return state
    },
    destination: destinationNode,
    resume: resumeSpy,
    close: closeSpy,
    createMediaElementSource: vi.fn(() => ({
      connect: connectSpy,
      disconnect: disconnectSpy,
    })),
    createMediaStreamDestination: vi.fn(() => ({
      stream: {
        getAudioTracks: () => [{ kind: 'audio', stop: audioTrackStopSpy }],
        getTracks: () => [{ kind: 'audio', stop: audioTrackStopSpy }],
      },
    })),
  } as unknown as AudioContext

  return {
    ctx,
    connectSpy,
    closeSpy,
    resumeSpy,
    audioTrackStopSpy,
    destinationNode,
  }
}

function setupCompressionMocks(options?: {
  supportedMimes?: string[]
  videoWidth?: number
  videoHeight?: number
  duration?: number
  failMetadata?: boolean
  recorderMime?: string
  chunkSizes?: number[]
  supportPauseResume?: boolean
  throwOnRecorderCreate?: boolean
  playMock?: (videoEl: HTMLVideoElement, attempt: number) => Promise<void>
}) {
  const supported = new Set(
    options?.supportedMimes ?? [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ],
  )
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:video-input')
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})

  const trackStop = vi.fn()
  const mockStream = {
    getVideoTracks: () => [{ kind: 'video', stop: trackStop }],
    getAudioTracks: () => [],
    getTracks: () => [{ kind: 'video', stop: trackStop }],
  } as unknown as MediaStream

  vi.stubGlobal(
    'MediaStream',
    class MockMediaStream {
      private readonly tracks: MediaStreamTrack[]
      constructor(tracks: MediaStreamTrack[] = []) {
        this.tracks = tracks
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === 'video')
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio')
      }
      getTracks() {
        return this.tracks
      }
    },
  )

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
  const videoPauseSpy = vi.spyOn(videoEl, 'pause').mockImplementation(() => {})

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

  interface RecorderHandle {
    mimeType: string
    state: RecordingState
    ondataavailable: ((ev: BlobEvent) => void) | null
    onstop: (() => void) | null
    onerror: ((ev: Event) => void) | null
    start: (timeslice?: number) => void
    stop: () => void
    pause?: () => void
    resume?: () => void
  }

  const createdRecorders: RecorderHandle[] = []
  const startMock = vi.fn()
  const stopMock = vi.fn()
  const pauseMock = vi.fn()
  const resumeMock = vi.fn()

  class MockMediaRecorder {
    static isTypeSupported = vi.fn((mime: string) => supported.has(mime))
    readonly mimeType: string
    state: RecordingState = 'inactive'
    ondataavailable: ((ev: BlobEvent) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    pause?: () => void
    resume?: () => void

    constructor(_stream: MediaStream, init?: MediaRecorderOptions) {
      if (options?.throwOnRecorderCreate) {
        throw new Error('NotSupportedError')
      }
      this.mimeType = options?.recorderMime ?? init?.mimeType ?? 'video/mp4'
      if (options?.supportPauseResume) {
        this.pause = () => {
          this.state = 'paused'
          pauseMock()
        }
        this.resume = () => {
          this.state = 'recording'
          resumeMock()
        }
      }
      createdRecorders.push(this)
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

  let playAttempt = 0
  const emitChunksAndEnd = () => {
    const rec = createdRecorders.at(-1)
    for (const size of options?.chunkSizes ?? [1024]) {
      const actualBytes = size <= 64 * 1024 ? size : 16
      const blob = new Blob([new Uint8Array(actualBytes)], {
        type: 'video/mp4',
      })
      if (size > actualBytes) {
        Object.defineProperty(blob, 'size', { value: size })
      }
      rec?.ondataavailable?.({ data: blob } as BlobEvent)
    }
    endedFlag = true
    videoEl.dispatchEvent(new Event('ended'))
  }

  const videoPlaySpy = vi
    .spyOn(videoEl, 'play')
    .mockImplementation(async () => {
      playAttempt += 1
      if (options?.playMock) {
        await options.playMock(videoEl, playAttempt)
        return
      }
      if (options?.chunkSizes) {
        queueMicrotask(emitChunksAndEnd)
      }
    })

  return {
    createObjectURL,
    revokeObjectURL,
    trackStop,
    videoEl,
    videoPauseSpy,
    videoPlaySpy,
    startMock,
    stopMock,
    pauseMock,
    resumeMock,
    getLatestRecorder: () => createdRecorders.at(-1) ?? null,
    emitChunksAndEnd,
    markEnded: () => {
      endedFlag = true
      videoEl.dispatchEvent(new Event('ended'))
    },
  }
}

describe('compressVideoFile', () => {
  it('streamer via createObjectURL uden arrayBuffer(), placerer video i viewport, bruger Wake Lock og rydder op', async () => {
    const wakeReleaseSpy = vi.fn().mockResolvedValue(undefined)
    const wakeRequestSpy = vi
      .fn()
      .mockResolvedValue({ release: wakeReleaseSpy })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: wakeRequestSpy },
    })

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

    const resultPromise = compressVideoFile(input, {
      onProgress: (event) => progressEvents.push(event),
    })

    await vi.waitFor(() => {
      expect(document.querySelector('video')).not.toBeNull()
    })
    const mountedVideo = document.querySelector('video')!
    expect(mountedVideo.style.position).toBe('fixed')
    expect(mountedVideo.style.right).toBe('0px')
    expect(mountedVideo.style.bottom).toBe('0px')
    expect(mountedVideo.style.width).toBe('2px')
    expect(mountedVideo.style.height).toBe('2px')
    expect(mountedVideo.style.left).toBe('')

    const result = await resultPromise

    expect(wakeRequestSpy).toHaveBeenCalledWith('screen')
    expect(wakeReleaseSpy).toHaveBeenCalledTimes(1)
    expect(arrayBufferSpy).not.toHaveBeenCalled()
    expect(env.createObjectURL).toHaveBeenCalledWith(input)
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
    expect(env.trackStop).toHaveBeenCalled()
    expect(document.querySelector('video')).toBeNull()
    expect(result.audioIncluded).toBe(false)
    expect(result.file.name).toBe('skovtur.mp4')
    expect(result.file.type).toBe('video/mp4')
    expect(result.file.size).toBe(3072)
    expect(progressEvents.some((p) => p.phase === 'preparing')).toBe(true)
    expect(progressEvents.some((p) => p.phase === 'compressing')).toBe(true)
    expect(progressEvents.at(-1)).toEqual({
      phase: 'compressing',
      progress: 1,
    })

    delete (navigator as { wakeLock?: unknown }).wakeLock
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

  it('opdager manglende MediaRecorder eller captureStream og kaster UNSUPPORTED_BROWSER', async () => {
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

    // Gendan MediaRecorder, men fjern captureStream på canvas
    setupCompressionMocks()
    delete (HTMLCanvasElement.prototype as { captureStream?: unknown })
      .captureStream
    expect(canCompressVideoInBrowser()).toBe(false)
    await expect(compressVideoFile(input)).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'UNSUPPORTED_BROWSER',
    })
  })

  it('optager lyd lydløst via AudioContext uden at forbinde til højttaler og lukker konteksten', async () => {
    const audioMock = createMockAudioContext('running')
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function MockAudioContext() {
        return audioMock.ctx
      }),
    )
    const env = setupCompressionMocks({ chunkSizes: [2048] })
    const input = new File(['raw'], 'medlyd.mp4', { type: 'video/mp4' })

    const result = await compressVideoFile(input)

    expect(result.audioIncluded).toBe(true)
    expect(env.videoEl.muted).toBe(false)
    expect(audioMock.connectSpy).toHaveBeenCalledTimes(1)
    expect(audioMock.connectSpy).not.toHaveBeenCalledWith(
      audioMock.destinationNode,
    )
    expect(audioMock.audioTrackStopSpy).toHaveBeenCalled()
    expect(audioMock.closeSpy).toHaveBeenCalledTimes(1)
  })

  it('lukker suspended AudioContext der ikke vågner og fortsætter uden lyd', async () => {
    const audioMock = createMockAudioContext('suspended', 'suspended')
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function MockAudioContext() {
        return audioMock.ctx
      }),
    )
    setupCompressionMocks({ chunkSizes: [1024] })
    const input = new File(['raw'], 'suspended.mp4', { type: 'video/mp4' })

    const result = await compressVideoFile(input)

    expect(audioMock.resumeSpy).toHaveBeenCalled()
    expect(audioMock.closeSpy).toHaveBeenCalledTimes(1)
    expect(result.audioIncluded).toBe(false)
  })

  it('genbruger eksternt AudioContext uden at lukke det i compressVideoFile', async () => {
    const provided = createMockAudioContext('running')
    setupCompressionMocks({ chunkSizes: [1024] })
    const input = new File(['raw'], 'genbrug.mp4', { type: 'video/mp4' })

    const result = await compressVideoFile(input, {
      audioContext: provided.ctx,
    })

    expect(result.audioIncluded).toBe(true)
    expect(provided.closeSpy).not.toHaveBeenCalled()
  })

  it('falder tilbage til lydløs afspilning hvis play() med lyd afvises, og markerer audioIncluded=false', async () => {
    const audioMock = createMockAudioContext('running')
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function MockAudioContext() {
        return audioMock.ctx
      }),
    )
    let envRef: ReturnType<typeof setupCompressionMocks>
    envRef = setupCompressionMocks({
      playMock: async (_videoEl, attempt) => {
        if (attempt === 1) {
          throw new DOMException('play() blocked', 'NotAllowedError')
        }
        queueMicrotask(() => {
          envRef.emitChunksAndEnd()
        })
      },
    })
    const input = new File(['raw'], 'autoplay.mp4', { type: 'video/mp4' })

    const result = await compressVideoFile(input)

    expect(envRef.videoPlaySpy).toHaveBeenCalledTimes(2)
    expect(envRef.videoEl.muted).toBe(true)
    expect(audioMock.closeSpy).toHaveBeenCalledTimes(1)
    expect(result.audioIncluded).toBe(false)
  })

  it('afviser med ENCODE_FAILED ved recorder.onerror', async () => {
    const env = setupCompressionMocks()
    const input = new File(['raw'], 'fejl.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input)
    await vi.waitFor(() => {
      expect(env.getLatestRecorder()).not.toBeNull()
    })
    env.getLatestRecorder()!.onerror?.(new Event('error'))

    await expect(promise).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'ENCODE_FAILED',
    })
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
  })

  it('kaster ENCODE_FAILED (ikke DECODE_FAILED) når createMediaRecorder kaster uden lyd', async () => {
    const env = setupCompressionMocks({ throwOnRecorderCreate: true })
    const input = new File(['raw'], 'optagerfejl.mp4', { type: 'video/mp4' })

    await expect(compressVideoFile(input)).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'ENCODE_FAILED',
    })
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:video-input')
  })

  it('pauser og genoptager ved visibilitychange når optageren støtter det', async () => {
    let hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })

    const env = setupCompressionMocks({ supportPauseResume: true })
    const progressEvents: Array<{ phase: string; progress: number | null }> = []
    const input = new File(['raw'], 'pausegenoptag.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input, {
      onProgress: (p) => progressEvents.push(p),
    })

    await vi.waitFor(() => {
      expect(env.startMock).toHaveBeenCalledTimes(1)
    })

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(env.pauseMock).toHaveBeenCalledTimes(1)
    expect(env.videoPauseSpy).toHaveBeenCalled()
    expect(progressEvents.some((p) => p.phase === 'paused')).toBe(true)

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(env.resumeMock).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => {
      expect(env.videoPlaySpy).toHaveBeenCalledTimes(2)
    })
    env.emitChunksAndEnd()

    const result = await promise
    expect(result.file.size).toBe(1024)
  })

  it('afbryder med INTERRUPTED_HIDDEN når browseren skjules uden pause/resume-støtte', async () => {
    let hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })

    const env = setupCompressionMocks({ supportPauseResume: false })
    const input = new File(['raw'], 'baggrund.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input)
    await vi.waitFor(() => {
      expect(env.startMock).toHaveBeenCalledTimes(1)
    })

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))

    await expect(promise).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'INTERRUPTED_HIDDEN',
      message:
        'Komprimeringen stoppede, fordi skærmen slukkede eller appen blev lukket. Prøv igen og hold skærmen tændt.',
    })
  })

  it('watchdog fejler med ENCODE_FAILED når currentTime står stille mens siden er synlig', async () => {
    const env = setupCompressionMocks()
    const input = new File(['raw'], 'hang.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input, { stallTimeoutMs: 60 })
    await vi.waitFor(() => {
      expect(env.startMock).toHaveBeenCalledTimes(1)
    })

    await expect(promise).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'ENCODE_FAILED',
    })
  })

  it('prøver genoptagelse én gang ved uventet pause og fejler med ENCODE_FAILED ved anden pause', async () => {
    const env = setupCompressionMocks()
    const input = new File(['raw'], 'uventetpause.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input, { stallTimeoutMs: 5000 })
    await vi.waitFor(() => {
      expect(env.startMock).toHaveBeenCalledTimes(1)
    })

    // Første uventede pause -> forsøger play() igen
    env.videoEl.dispatchEvent(new Event('pause'))
    expect(env.videoPlaySpy).toHaveBeenCalledTimes(2)

    // Anden uventede pause -> opgiver med ENCODE_FAILED
    env.videoEl.dispatchEvent(new Event('pause'))
    await expect(promise).rejects.toMatchObject({
      name: 'VideoCompressionError',
      code: 'ENCODE_FAILED',
    })
  })

  it('henter ny Wake Lock når siden bliver synlig igen efter at være blevet skjult (R11)', async () => {
    let hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })

    const sentinels: Array<{
      released: boolean
      releaseSpy: ReturnType<typeof vi.fn>
      triggerBrowserRelease: () => void
    }> = []

    const wakeRequestSpy = vi.fn(async () => {
      const target = new EventTarget()
      const releaseSpy = vi.fn(async () => {
        entry.released = true
      })
      const entry = {
        released: false,
        releaseSpy,
        triggerBrowserRelease: () => {
          entry.released = true
          target.dispatchEvent(new Event('release'))
        },
        sentinel: {
          get released() {
            return entry.released
          },
          release: releaseSpy,
          addEventListener: target.addEventListener.bind(target),
        },
      }
      sentinels.push(entry)
      return entry.sentinel
    })

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: wakeRequestSpy },
    })

    const env = setupCompressionMocks({ supportPauseResume: true })
    const input = new File(['raw'], 'wakelockresume.mp4', { type: 'video/mp4' })

    const promise = compressVideoFile(input)
    await vi.waitFor(() => {
      expect(env.startMock).toHaveBeenCalledTimes(1)
      expect(sentinels).toHaveLength(1)
    })

    // Browseren frigiver skærmlåsen når siden skjules
    hidden = true
    sentinels[0]!.triggerBrowserRelease()
    document.dispatchEvent(new Event('visibilitychange'))

    // Når siden bliver synlig igen, skal wakeLock.request('screen') kaldes igen
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => {
      expect(wakeRequestSpy).toHaveBeenCalledTimes(2)
      expect(sentinels).toHaveLength(2)
    })

    env.emitChunksAndEnd()
    await promise

    expect(sentinels[1]!.releaseSpy).toHaveBeenCalledTimes(1)
  })

  it('ignorerer AbortError fra play() hvis siden skjules igen imens og afbryder ikke efter videoEnded (R12)', async () => {
    let hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })

    let rejectPendingPlay: ((err: Error) => void) | null = null
    let envRef: ReturnType<typeof setupCompressionMocks>
    envRef = setupCompressionMocks({
      supportPauseResume: true,
      playMock: (_videoEl, attempt) => {
        if (attempt === 2) {
          return new Promise<void>((_resolve, reject) => {
            rejectPendingPlay = reject
          })
        }
        return Promise.resolve()
      },
    })

    const input = new File(['raw'], 'r12.mp4', { type: 'video/mp4' })
    const promise = compressVideoFile(input)
    await vi.waitFor(() => {
      expect(envRef.startMock).toHaveBeenCalledTimes(1)
    })

    // 1. Skjul -> pause
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    // 2. Synlig -> resume kalder video.play(), som afventer
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => {
      expect(rejectPendingPlay).not.toBeNull()
    })

    // 3. Skjul hurtigt igen, før resume's play() når at resolve -> pause() afviser play() med AbortError
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    rejectPendingPlay!(
      new DOMException('The play() request was interrupted', 'AbortError'),
    )
    await Promise.resolve()

    // 4. Synlig igen -> genoptager og videoen slutter
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => {
      expect(envRef.videoPlaySpy).toHaveBeenCalledTimes(3)
    })

    // 5. Videoen slutter, men skjules før recorder.onstop kører -> skal stadig gennemføre rent
    const rec = envRef.getLatestRecorder()!
    const origStop = rec.stop.bind(rec)
    rec.stop = () => {
      origStop()
    }
    envRef.emitChunksAndEnd()
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))

    const result = await promise
    expect(result.file.size).toBe(1024)
  })
})
