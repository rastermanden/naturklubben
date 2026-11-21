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

import { useUploadPhotos } from './useUploadPhotos'

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
      'Videoen er for stor. Maksimum er 50 MB.',
    )
  })
})
