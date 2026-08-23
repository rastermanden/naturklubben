import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload }),
    },
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}))

import {
  createUploadQueueItems,
  uploadQueuedPhoto,
  validateFiles,
} from './useUploadPhotos'
import { requestPhotoDeletion } from './useDeletePhoto'
import { requestPhotoOptimization } from './useRetryPhotoOptimization'

beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue({ error: null })
  mocks.rpc.mockReset().mockResolvedValue({ error: null })
  mocks.invoke.mockReset().mockResolvedValue({ error: null })
})

describe('gallery upload operations', () => {
  it('keeps file type and size validation', () => {
    expect(
      validateFiles([new File(['text'], 'notes.txt', { type: 'text/plain' })]),
    ).toBe('notes.txt er ikke et billede.')
    expect(
      validateFiles([
        new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.jpg', {
          type: 'image/jpeg',
        }),
      ]),
    ).toBe('large.jpg er for stor (maks. 15 MB).')
  })

  it('snapshots caption and event metadata into every queue item', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    const files = [
      new File(['one'], 'one.JPG', { type: 'image/jpeg' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ]

    const items = createUploadQueueItems({
      files,
      caption: 'Skovtur',
      eventId: 'event-1',
    })

    expect(items.map(({ caption, eventId }) => ({ caption, eventId }))).toEqual(
      [
        { caption: 'Skovtur', eventId: 'event-1' },
        { caption: 'Skovtur', eventId: 'event-1' },
      ],
    )
    expect(items.map(({ photoId }) => photoId)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
  })

  it('retries with the same path and metadata through narrow RPCs', async () => {
    const file = new File(['image'], 'trip.JPG', { type: 'image/jpeg' })
    const [item] = createUploadQueueItems({
      files: [file],
      caption: '  Ved søen  ',
      eventId: 'event-1',
    })
    item.photoId = '00000000-0000-4000-8000-000000000003'
    item.id = item.photoId
    item.storagePath = `owner/${item.photoId}.jpg`

    await uploadQueuedPhoto(item, 'owner')
    await uploadQueuedPhoto(item, 'owner')

    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.upload).toHaveBeenNthCalledWith(1, item.storagePath, file, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    expect(mocks.upload.mock.calls[1]).toEqual(mocks.upload.mock.calls[0])
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'upsert_photo_upload', {
      p_photo_id: item.photoId,
      p_storage_path: item.storagePath,
      p_caption: '  Ved søen  ',
      p_event_id: 'event-1',
    })
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0])
  })

  it('requests optimization with only the server-owned photo lookup key', async () => {
    await requestPhotoOptimization('photo-1')

    expect(mocks.invoke).toHaveBeenCalledWith('optimize-image', {
      body: { photoId: 'photo-1' },
    })
  })

  it('routes deletion through the trusted function instead of client storage', async () => {
    await requestPhotoDeletion('photo-1')

    expect(mocks.invoke).toHaveBeenCalledWith('optimize-image', {
      body: { action: 'delete', photoId: 'photo-1' },
    })
  })
})
