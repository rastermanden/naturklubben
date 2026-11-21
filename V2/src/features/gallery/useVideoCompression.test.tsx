import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_VIDEO_BYTES } from './galleryMedia'

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
})

describe('useVideoCompression', () => {
  it('indlæser ikke komprimeringsmodulet før enqueueVideos kaldes, og kører jobbene sekventielt', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()

    let resolveFirst!: (file: File) => void
    let resolveSecond!: (file: File) => void
    compressVideoFileMock
      .mockImplementationOnce(
        () =>
          new Promise<File>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<File>((resolve) => {
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
      resolveFirst(out1)
    })

    await vi.waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(2)
    })
    expect(onCompressed).toHaveBeenCalledWith({
      file: out1,
      caption: 'Skovtur',
      eventId: 'event-1',
    })

    const out2 = makeFile('klip2.mp4', 'video/mp4', 15_000_000)
    await act(async () => {
      resolveSecond(out2)
    })

    await vi.waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })
    expect(onCompressed).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
  })

  it('afviser hvis det komprimerede resultat stadig er over 50 MB og uploader ikke', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()
    compressVideoFileMock.mockResolvedValueOnce(
      makeFile('stadig-stor.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1),
    )

    const { result } = renderHook(() =>
      useVideoCompression({ onCompressed, onError }),
    )

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
      expect(onError).toHaveBeenCalledTimes(1)
    })
    expect(onError).toHaveBeenCalledWith(
      'stadig-stor.mp4 var stadig over 50 MB efter komprimering og blev ikke lagt op. Prøv et kortere klip.',
    )
    expect(onCompressed).not.toHaveBeenCalled()
  })

  it('annullerer både igangværende og ventende job uden upload', async () => {
    const onCompressed = vi.fn()
    const onError = vi.fn()
    let activeSignal: AbortSignal | undefined

    compressVideoFileMock.mockImplementationOnce(
      (file: File, opts?: { signal?: AbortSignal }) => {
        activeSignal = opts?.signal
        return new Promise<File>((_resolve, reject) => {
          opts?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                new Error(
                  `Komprimeringen af ${file.name} blev annulleret. Videoen blev ikke lagt op.`,
                ),
              ),
            { once: true },
          )
        })
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
        return new Promise<File>((_resolve, reject) => {
          rejectCompress = reject
        })
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
