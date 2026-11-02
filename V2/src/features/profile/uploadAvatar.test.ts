import { describe, expect, it, vi } from 'vitest'

vi.mock('./resizeAvatar', () => ({
  resizeAvatarFile: async (file: Blob) => {
    if (!file.type.startsWith('image/')) throw new Error('AVATAR_NOT_AN_IMAGE')
    return new Blob(['jpeg'], { type: 'image/jpeg' })
  },
}))

import { uploadAvatar } from './uploadAvatar'

describe('uploadAvatar', () => {
  it('poster det skalerede billede og gemmer storage-id', async () => {
    const generateUploadUrl = vi.fn(async () => ({
      uploadUrl: 'https://upload.example/avatar',
    }))
    const saveAvatar = vi.fn(async () => null)
    const posted: RequestInit[] = []
    const post = async (_url: string, init: RequestInit) => {
      posted.push(init)
      return new Response(JSON.stringify({ storageId: 'kg2storage' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await uploadAvatar({
      file: new Blob(['png'], { type: 'image/png' }),
      generateUploadUrl,
      saveAvatar,
      post,
    })

    expect(posted).toHaveLength(1)
    expect(posted[0]?.method).toBe('POST')
    expect(posted[0]?.headers).toMatchObject({ 'Content-Type': 'image/jpeg' })
    expect(saveAvatar).toHaveBeenCalledWith({ storageId: 'kg2storage' })
  })

  it('sender ikke filen, når den ikke er et billede', async () => {
    const post = vi.fn()
    await expect(
      uploadAvatar({
        file: new Blob(['tekst'], { type: 'text/plain' }),
        generateUploadUrl: async () => ({
          uploadUrl: 'https://upload.example',
        }),
        saveAvatar: async () => null,
        post,
      }),
    ).rejects.toThrow('AVATAR_NOT_AN_IMAGE')
    expect(post).not.toHaveBeenCalled()
  })
})
