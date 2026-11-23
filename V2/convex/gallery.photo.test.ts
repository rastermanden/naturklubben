/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import {
  createTestConvex,
  withAuthUser,
  type TestConvexInstance,
} from '../test/convexTestAuth'
import { api } from './_generated/api'

async function seedMember(t: TestConvexInstance) {
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

async function storeImage(t: TestConvexInstance, bytes: string) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: 'image/jpeg' }),
    )
    await ctx.db.patch(
      storageId as never,
      {
        contentType: 'image/jpeg',
      } as never,
    )
    return storageId
  })
}

describe('createPhoto', () => {
  it('gemmer et browser-skaleret billede som klar med miniature', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const storageId = await storeImage(t, 'visning')
    const thumbnailStorageId = await storeImage(t, 'mini')

    const photoId = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.gallery.createPhoto, {
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

async function seedEvent(
  t: TestConvexInstance,
  event: { title: string; startAt: number },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert('events', {
      title: event.title,
      startAt: event.startAt,
      endsAt: event.startAt + 3_600_000,
      isPublic: false,
      attendingCount: 0,
      waitlistedCount: 0,
      approvedGuestCount: 0,
      createdAt: event.startAt,
    }),
  )
}

describe('createPhoto med en begivenhed (#332)', () => {
  it('lægger billedet i begivenhedens album og tager titlen fra begivenheden', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Hornfisketur', startAt: 1000 })
    const storageId = await storeImage(t, 'visning')

    const photoId = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.gallery.createPhoto, {
      storageId,
      eventId,
      // Klientens titel skal ikke kunne navngive albummet.
      eventTitle: 'Noget helt andet',
    })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      albums: await ctx.db.query('photoAlbums').collect(),
    }))
    expect(after.photo).toMatchObject({ eventId, albumKey: eventId })
    expect(after.albums).toHaveLength(1)
    expect(after.albums[0]).toMatchObject({
      albumKey: eventId,
      eventId,
      title: 'Hornfisketur',
      photoCount: 1,
    })
  })

  it('samler to billeder fra samme begivenhed i ét album', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Fugletårnet', startAt: 2000 })
    const asMember = await withAuthUser(t, member.userId)

    await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'et'),
      eventId,
    })
    await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'to'),
      eventId,
    })

    const albums = await t.run(async (ctx) =>
      ctx.db.query('photoAlbums').collect(),
    )
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({ albumKey: eventId, photoCount: 2 })
  })

  it('lander i "Uden begivenhed", når begivenheden er slettet imens', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Aflyst tur', startAt: 3000 })
    await t.run(async (ctx) => ctx.db.delete(eventId))
    const storageId = await storeImage(t, 'visning')

    // Billedet må ikke gå tabt, fordi turen blev slettet, mens uploaden lå i
    // køen -- og albummet må ikke komme til at hedde "Ukendt begivenhed".
    const photoId = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.gallery.createPhoto, { storageId, eventId })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      albums: await ctx.db.query('photoAlbums').collect(),
    }))
    expect(after.photo).toMatchObject({ albumKey: 'without-event' })
    expect(after.photo?.eventId).toBeUndefined()
    expect(after.albums).toHaveLength(1)
    expect(after.albums[0]).toMatchObject({ albumKey: 'without-event' })
    expect(after.albums[0]?.eventId).toBeUndefined()
  })

  it('lander i "Uden begivenhed" for et id, der ikke er et begivenheds-id', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const storageId = await storeImage(t, 'visning')

    const photoId = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.gallery.createPhoto, {
      storageId,
      eventId: 'ikke-et-id',
      eventTitle: 'Et album, ingen tur har',
    })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      albums: await ctx.db.query('photoAlbums').collect(),
    }))
    expect(after.photo).toMatchObject({ albumKey: 'without-event' })
    expect(after.albums[0]?.title).toBeUndefined()
  })
})

describe('createPhoto og de migrerede album (#332)', () => {
  it('holder billedet i et V1-album, hvis nøgle ikke er et begivenheds-id', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    // V1-importen bruger V1's egen UUID som både albumKey og eventId
    // (`migrateV1.ts`); begivenhederne fik nye Convex-id'er. Uploader man inde
    // i et sådant album, skal billedet i albummet -- ikke i "Uden begivenhed".
    const legacyKey = '7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60'
    await t.run(async (ctx) => {
      await ctx.db.insert('photoAlbums', {
        albumKey: legacyKey,
        eventId: legacyKey,
        title: 'Hornfisketur 2024',
        photoCount: 3,
        latestPhotoAt: 10,
      })
    })
    const storageId = await storeImage(t, 'visning')

    const photoId = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.gallery.createPhoto, { storageId, eventId: legacyKey })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      albums: await ctx.db.query('photoAlbums').collect(),
    }))
    expect(after.photo).toMatchObject({
      albumKey: legacyKey,
      eventId: legacyKey,
    })
    expect(after.albums).toHaveLength(1)
    expect(after.albums[0]).toMatchObject({
      albumKey: legacyKey,
      // Albummets egen titel bliver stående: der er ingen begivenhed at læse
      // en ny af, og klientens ord må ikke navngive den.
      title: 'Hornfisketur 2024',
      photoCount: 4,
    })
  })

  it('lader albumtitlen følge en omdøbt begivenhed', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Gammelt navn', startAt: 1000 })
    const asMember = await withAuthUser(t, member.userId)

    await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'et'),
      eventId,
    })
    await t.run(async (ctx) => ctx.db.patch(eventId, { title: 'Nyt navn' }))
    await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'to'),
      eventId,
    })

    const albums = await t.run(async (ctx) =>
      ctx.db.query('photoAlbums').collect(),
    )
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({ title: 'Nyt navn', photoCount: 2 })
  })
})
