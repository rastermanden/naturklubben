import { act, renderHook } from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateUploadUrlMock = vi.fn()
const createPhotoMock = vi.fn()
const createVideoMock = vi.fn()
const captureVideoThumbnailMock = vi.fn()
const resizePhotoFileMock = vi.fn()

vi.mock('convex/react', () => ({
  useMutation: (ref: FunctionReference<'mutation'>) => {
    const name = getFunctionName(ref)
    if (name === 'gallery:generateUploadUrl') return generateUploadUrlMock
    if (name === 'gallery:createPhoto') return createPhotoMock
    if (name === 'gallery:createVideo') return createVideoMock
    return vi.fn()
  },
}))

vi.mock('./videoThumbnail', () => ({
  captureVideoThumbnail: (...args: unknown[]) =>
    captureVideoThumbnailMock(...args),
}))

vi.mock('./resizePhoto', () => ({
  PHOTO_MAX_EDGE: 1600,
  THUMB_MAX_EDGE: 400,
  resizePhotoFile: (...args: unknown[]) => resizePhotoFileMock(...args),
}))

import { VIDEO_UPLOAD_FAILED, useUploadPhotos } from './useUploadPhotos'

beforeEach(() => {
  generateUploadUrlMock.mockReset()
  createPhotoMock.mockReset()
  createVideoMock.mockReset()
  captureVideoThumbnailMock.mockReset()
  resizePhotoFileMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useUploadPhotos: videoer', () => {
  it('nævner forbindelsen, når selve overførslen af en video fejler', async () => {
    // Convex' upload timer ud efter 2 minutter. En stor video på en langsom
    // forbindelse kan derfor ikke nå frem, og "Prøv igen" alene hjælper ikke
    // -- beskeden skal pege på forbindelsen (#371). Et netværksbrud giver
    // samme `TypeError` fra `fetch` som en afbrudt request.
    generateUploadUrlMock.mockResolvedValueOnce({
      uploadUrl: 'https://upload.example.test/video',
    })
    captureVideoThumbnailMock.mockResolvedValue(null)
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderHook(() => useUploadPhotos())
    await act(async () => {
      result.current.enqueue({
        files: [new File(['mp4bytes'], 'lang.mp4', { type: 'video/mp4' })],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(result.current.items[0]?.status).toBe('failed')
    })
    expect(result.current.items[0]?.error).toBe(VIDEO_UPLOAD_FAILED)
    expect(result.current.items[0]?.error).toMatch(/forbindelse/)
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('beholder den almindelige besked, når et billede fejler', async () => {
    generateUploadUrlMock.mockResolvedValueOnce({
      uploadUrl: 'https://upload.example.test/foto',
    })
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderHook(() => useUploadPhotos())
    await act(async () => {
      result.current.enqueue({
        files: [new File(['jpg'], 'fugl.jpg', { type: 'image/jpeg' })],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(result.current.items[0]?.status).toBe('failed')
    })
    expect(result.current.items[0]?.error).not.toBe(VIDEO_UPLOAD_FAILED)
  })

  it('fanger stillbillede, uploader video + miniature og registrerer via createVideo', async () => {
    generateUploadUrlMock
      .mockResolvedValueOnce({ uploadUrl: 'https://upload.example.test/video' })
      .mockResolvedValueOnce({ uploadUrl: 'https://upload.example.test/thumb' })
    captureVideoThumbnailMock.mockResolvedValue({
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      width: 400,
      height: 225,
    })
    createVideoMock.mockResolvedValue({ ok: true, id: 'video-1' })

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ storageId: 'storage-video' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ storageId: 'storage-thumb' }), {
          status: 200,
        }),
      )

    const { result } = renderHook(() => useUploadPhotos())
    const videoFile = new File(['mp4bytes'], 'skovtur.mp4', {
      type: 'video/mp4',
    })

    await act(async () => {
      result.current.enqueue({
        files: [videoFile],
        caption: 'Rådyr på stien',
        eventId: 'event-1',
      })
    })

    await vi.waitFor(() => {
      expect(result.current.items[0]?.status).toBe('saved')
    })

    expect(captureVideoThumbnailMock).toHaveBeenCalledWith(videoFile)
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://upload.example.test/video',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'video/mp4' },
      }),
    )
    expect(createVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: 'storage-video',
        thumbnailStorageId: 'storage-thumb',
        width: 400,
        height: 225,
        caption: 'Rådyr på stien',
        eventId: 'event-1',
      }),
    )
    expect(createPhotoMock).not.toHaveBeenCalled()
  })

  it('uploader video uden miniature hvis stillbillede ikke kan fanges, og viser dansk fejl ved server-afvisning', async () => {
    generateUploadUrlMock.mockResolvedValue({
      uploadUrl: 'https://upload.example.test/video',
    })
    captureVideoThumbnailMock.mockResolvedValue(null)
    createVideoMock.mockResolvedValue({
      ok: false,
      error: 'VIDEO_TOO_LARGE',
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ storageId: 'storage-big' }), {
        status: 200,
      }),
    )

    const { result } = renderHook(() => useUploadPhotos())
    const movFile = new File(['movbytes'], 'klip.mov', {
      type: 'video/quicktime',
    })

    await act(async () => {
      result.current.enqueue({
        files: [movFile],
        caption: '',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(result.current.items[0]?.status).toBe('failed')
    })

    expect(createVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: 'storage-big',
        thumbnailStorageId: undefined,
      }),
    )
    expect(result.current.items[0]?.error).toBe(
      'Videoen er for stor. Maksimum er 95 MB.',
    )
  })

  it('giver billeder med tom MIME-type deres udledte MIME før skalering (R2)', async () => {
    generateUploadUrlMock
      .mockResolvedValueOnce({ uploadUrl: 'https://upload.example.test/disp' })
      .mockResolvedValueOnce({ uploadUrl: 'https://upload.example.test/thumb' })
    resizePhotoFileMock
      .mockResolvedValueOnce({
        blob: new Blob(['disp'], { type: 'image/jpeg' }),
        width: 1200,
        height: 800,
      })
      .mockResolvedValueOnce({
        blob: new Blob(['thumb'], { type: 'image/jpeg' }),
        width: 400,
        height: 267,
      })
    createPhotoMock.mockResolvedValue('photo-empty-mime')

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ storageId: 'storage-disp' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ storageId: 'storage-thumb' }), {
          status: 200,
        }),
      )

    const { result } = renderHook(() => useUploadPhotos())
    const jpgWithoutMime = new File(['jpgbytes'], 'mobilfoto.jpg', {
      type: '',
    })

    await act(async () => {
      result.current.enqueue({
        files: [jpgWithoutMime],
        caption: 'Fra kamerarulle',
        eventId: null,
      })
    })

    await vi.waitFor(() => {
      expect(result.current.items[0]?.status).toBe('saved')
    })

    expect(resizePhotoFileMock).toHaveBeenCalledTimes(2)
    const firstPassedBlob = resizePhotoFileMock.mock.calls[0]?.[0] as Blob
    expect(firstPassedBlob).toBeInstanceOf(Blob)
    expect(firstPassedBlob.type).toBe('image/jpeg')
    expect(createPhotoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: 'storage-disp',
        thumbnailStorageId: 'storage-thumb',
        caption: 'Fra kamerarulle',
      }),
    )
  })
})
