/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('gallery links', () => {
  it('trækker linket tilbage uden at slette filen', async () => {
    const t = convexTest(schema, modules)
    const member = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { email: 'foto@example.com' })
      const profileId = await ctx.db.insert('profiles', {
        userId,
        fullName: 'Foto',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
      return { userId, profileId }
    })
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(
        new Blob(['jpeg'], { type: 'image/jpeg' }),
      )
      await (
        ctx.db as unknown as {
          patch: (id: string, value: { contentType: string }) => Promise<void>
        }
      ).patch(id, { contentType: 'image/jpeg' })
      return id
    })
    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
        storageId,
        thumbnailStorageId: storageId,
        clientUploadId: 'link-1',
      })
    const before = await t.run(async (ctx) => ctx.db.get(photoId))
    const oldToken = before?.displayToken
    expect(oldToken).toBeTruthy()
    const found = await t.query(internal.gallery.photoForToken, {
      token: oldToken!,
      kind: 'display',
    })
    expect(found?.storageId).toBe(storageId)

    await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.revokePhotoLink, { photoId })

    const after = await t.run(async (ctx) => ctx.db.get(photoId))
    expect(after?.storageId).toBe(storageId)
    expect(after?.displayToken).not.toBe(oldToken)
    const gone = await t.query(internal.gallery.photoForToken, {
      token: oldToken!,
      kind: 'display',
    })
    expect(gone).toBeNull()
  })
})
