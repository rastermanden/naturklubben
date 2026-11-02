/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function seedMember(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'foto@example.com' })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: 'Foto Medlem',
      isAdmin: false,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

async function storeImage(t: ReturnType<typeof convexTest>, bytes: string) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: 'image/jpeg' }),
    )
    await ctx.db.patch(storageId, { contentType: 'image/jpeg' })
    return storageId
  })
}

describe('createPhoto', () => {
  it('gemmer et browser-skaleret billede som klar med miniature', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const storageId = await storeImage(t, 'visning')
    const thumbnailStorageId = await storeImage(t, 'mini')

    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
        storageId,
        thumbnailStorageId,
        width: 800,
        height: 600,
        caption: 'Et blad',
        clientUploadId: 'forsog-1',
      })

    const after = await t.run(async (ctx) => {
      const photo = await ctx.db.get(photoId)
      const albums = await ctx.db.query('photoAlbums').collect()
      return { photo, albums }
    })
    expect(after.photo).toMatchObject({
      optimizationStatus: 'ready',
      thumbnailStorageId,
      optimizedStorageId: storageId,
      width: 800,
      height: 600,
      caption: 'Et blad',
      uploaderId: member.profileId,
    })
    expect(after.albums).toHaveLength(1)
    expect(after.albums[0]).toMatchObject({
      albumKey: 'without-event',
      photoCount: 1,
      coverPhotoId: photoId,
      coverThumbnailStorageId: thumbnailStorageId,
    })
  })
})
