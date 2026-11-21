import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_VIDEO_BYTES } from './galleryMedia'
import { VideoCompressionError } from './videoCompressionError'

const compressVideoFileMock = vi.fn()
const loadVideoCompressorMock = vi.fn()

vi.mock('./videoCompressionLoader', () => ({
  loadVideoCompressor: (...args: unknown[]) => loadVideoCompressorMock(...args),
}))

import { useVideoCompression } from './useVideoCompression'

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  compressVideoFileMock.mockReset()
  loadVideoCompressorMock
    .mockReset()
    .mockResolvedValue({ compressVideoFile: compressVideoFileMock })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useVideoCompression', () => {
  it('indlæser ikke komprimeringsmodulet før enqueueVideos kaldes, og kører jobbene sekventielt', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()

    let resolveFirst!: (res: { file: File; audioIncluded: boolean }) => void
    let resolveSecond!: (res: { file: File; audioIncluded: boolean }) => void
    compressVideoFileMock
      .mockImplementationOnce(
        () =>
          new Promise<{ file: File; audioIncluded: boolean }>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ file: File; audioIncluded: boolean }>((resolve) => {
            resolveSecond = resolve
          }),
      )

    const { result } = renderHook(() =>
      useVideoCompression({ onCompressed, onError }),
    )
    expect(loadVideoCompressorMock).not.toHaveBeenCalled()

    const big1 = makeFile('klip1.mov', 'video/quicktime', MAX_VIDEO_BYTES + 10)
    const big2 = makeFile('klip2.mp4', 'video/mp4', MAX_VIDEO_BYTES + 20)

    await act(async () => {
      result.current.enqueueVideos({
        files: [big1, big2],
        caption: 'Skovtur',
        eventId: 'event-1',
      })
    })

    await vi.waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    })
    expect(loadVideoCompressorMock).toHaveBeenCalledTimes(1)
    expect(result.current.jobs).toHaveLength(2)

    const out1 = makeFile('klip1.mp4', 'video/mp4', 12_000_000)
    await act(async () => {
      resolveFirst({ file: out1, audioIncluded: true })
    })

    await vi.waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(2)
    })
    expect(onCompressed).toHaveBeenCalledWith({
      file: out1,
      caption: 'Skovtur',
      eventId: 'event-1',
      audioIncluded: true,
      originalFileName: 'klip1.mov',
    })

    const out2 = makeFile('klip2.mp4', 'video/mp4', 15_000_000)
    await act(async () => {
      resolveSecond({ file: out2, audioIncluded: false })
    })

    await vi.waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })
    expect(onCompressed).toHaveBeenCalledTimes(2)
    expect(onCompressed).toHaveBeenLastCalledWith({
      file: out2,
      caption: 'Skovtur',
      eventId: 'event-1',
      audioIncluded: false,
      originalFileName: 'klip2.mp4',
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('viser dansk fejl og aldrig rå engelsk tekst når loadVideoCompressor eller komprimering fejler med TypeError', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()

    loadVideoCompressorMock.mockRejectedValueOnce(
      new TypeError('Failed to fetch dynamically imported module'),
    )

    const { result } = renderHook(() =>
      useVideoCompression({ onCompressed, onError }),
    )

    await act(async () => {
      result.current.enqueueVideos({
        files: [makeFile('offline.mp4', 'video/mp4', MAX_VIDEO_BYTES + 100)],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
    expect(onError).toHaveBeenCalledWith(
      'Komprimeringen kunne ikke hentes. Tjek forbindelsen, genindlæs siden og prøv igen.',
    )

    // Ukendt engelsk TypeError fra compressVideoFile erstattes også af dansk fallback.
    compressVideoFileMock.mockRejectedValueOnce(
      new TypeError('Cannot read properties of undefined (reading getTracks)'),
    )

    await act(async () => {
      result.current.enqueueVideos({
        files: [makeFile('tur.mp4', 'video/mp4', MAX_VIDEO_BYTES + 100)],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(2)
    })
    expect(onError).toHaveBeenLastCalledWith(
      'tur.mp4 kunne ikke komprimeres og blev ikke lagt op. Prøv igen eller vælg en kortere video.',
    )
    expect(onCompressed).not.toHaveBeenCalled()
  })

  it('beholder kendt VideoCompressionError-besked på dansk og afviser resultat over 50 MB', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()

    compressVideoFileMock.mockRejectedValueOnce(
      new VideoCompressionError(
        'INTERRUPTED_HIDDEN',
        'Komprimeringen stoppede, fordi skærmen slukkede eller appen blev lukket. Prøv igen og hold skærmen tændt.',
      ),
    )

    const { result } = renderHook(() =>
      useVideoCompression({ onCompressed, onError }),
    )

    await act(async () => {
      result.current.enqueueVideos({
        files: [makeFile('skjult.mp4', 'video/mp4', MAX_VIDEO_BYTES + 100)],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        'Komprimeringen stoppede, fordi skærmen slukkede eller appen blev lukket. Prøv igen og hold skærmen tændt.',
      )
    })

    compressVideoFileMock.mockResolvedValueOnce({
      file: makeFile('stadig-stor.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1),
      audioIncluded: true,
    })

    await act(async () => {
      result.current.enqueueVideos({
        files: [
          makeFile('stadig-stor.mp4', 'video/mp4', MAX_VIDEO_BYTES + 100),
        ],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(2)
    })
    expect(onError).toHaveBeenLastCalledWith(
      'stadig-stor.mp4 var stadig over 50 MB efter komprimering og blev ikke lagt op. Prøv et kortere klip.',
    )
    expect(onCompressed).not.toHaveBeenCalled()
  })

  it('opretter og genoptager AudioContext synkront i prepareAudioContext og lukker den ved oprydning', async () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined)
    const closeSpy = vi.fn().mockResolvedValue(undefined)
    let state: AudioContextState = 'suspended'
    const fakeCtx = {
      get state() {
        return state
      },
      resume: resumeSpy,
      close: closeSpy,
    } as unknown as AudioContext
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function MockAudioContext() {
        return fakeCtx
      }),
    )

    compressVideoFileMock.mockResolvedValueOnce({
      file: makeFile('klar.mp4', 'video/mp4', 1024),
      audioIncluded: true,
    })

    const onCompressed = vi.fn()
    const { result } = renderHook(() =>
      useVideoCompression({ onCompressed, onError: vi.fn() }),
    )

    act(() => {
      result.current.prepareAudioContext()
    })
    expect(resumeSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.enqueueVideos({
        files: [makeFile('klar.mov', 'video/quicktime', MAX_VIDEO_BYTES + 1)],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(onCompressed).toHaveBeenCalledTimes(1)
    })
    expect(compressVideoFileMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ audioContext: fakeCtx }),
    )
    expect(closeSpy).toHaveBeenCalledTimes(1)

    // releasePreparedAudioContext lukker også en ubrugt kontekst hvis ingen stor video blev valgt
    state = 'running'
    act(() => {
      result.current.prepareAudioContext()
      result.current.releasePreparedAudioContext()
    })
    expect(closeSpy).toHaveBeenCalledTimes(2)
  })

  it('annullerer både igangværende og ventende job uden upload', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()
    let activeSignal: AbortSignal | undefined

    compressVideoFileMock.mockImplementationOnce(
      (file: File, opts?: { signal?: AbortSignal }) => {
        activeSignal = opts?.signal
        return new Promise<{ file: File; audioIncluded: boolean }>(
          (_resolve, reject) => {
            opts?.signal?.addEventListener(
              'abort',
              () =>
                reject(
                  new VideoCompressionError(
                    'CANCELLED',
                    `Komprimeringen af ${file.name} blev annulleret. Videoen blev ikke lagt op.`,
                  ),
                ),
              { once: true },
            )
          },
        )
      },
    )

    const { result } = renderHook(() =>
      useVideoCompression({ onCompressed, onError }),
    )

    await act(async () => {
      result.current.enqueueVideos({
        files: [
          makeFile('aktiv.mp4', 'video/mp4', MAX_VIDEO_BYTES + 10),
          makeFile('venter.mp4', 'video/mp4', MAX_VIDEO_BYTES + 20),
        ],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    })
    const activeId = result.current.jobs[0]!.id
    const queuedId = result.current.jobs[1]!.id

    act(() => {
      result.current.cancelJob(queuedId)
    })
    expect(onError).toHaveBeenCalledWith(
      'Komprimeringen af venter.mp4 blev annulleret. Videoen blev ikke lagt op.',
    )
    expect(result.current.jobs).toHaveLength(1)

    act(() => {
      result.current.cancelJob(activeId)
    })
    expect(activeSignal?.aborted).toBe(true)

    await vi.waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })
    expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    expect(onCompressed).not.toHaveBeenCalled()
  })

  it('afbryder aktiv komprimering ved unmount uden at kalde callbacks bagefter', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()
    let activeSignal: AbortSignal | undefined
    let rejectCompress!: (err: Error) => void

    compressVideoFileMock.mockImplementationOnce(
      (_file: File, opts?: { signal?: AbortSignal }) => {
        activeSignal = opts?.signal
        return new Promise<{ file: File; audioIncluded: boolean }>(
          (_resolve, reject) => {
            rejectCompress = reject
          },
        )
      },
    )

    const { result, unmount } = renderHook(() =>
      useVideoCompression({ onCompressed, onError }),
    )

    await act(async () => {
      result.current.enqueueVideos({
        files: [makeFile('forladt.mp4', 'video/mp4', MAX_VIDEO_BYTES + 10)],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    })

    unmount()
    expect(activeSignal?.aborted).toBe(true)

    await act(async () => {
      rejectCompress(new Error('annulleret'))
    })
    expect(onCompressed).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
