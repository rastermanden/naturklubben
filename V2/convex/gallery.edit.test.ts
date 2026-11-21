/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function setup() {
  return convexTest(schema, modules)
}

type Test = ReturnType<typeof setup>

async function seedUser(
  t: Test,
  opts: {
    email: string
    fullName: string
    isAdmin?: boolean
    deletionReservedAt?: number
  },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: opts.email })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: opts.fullName,
      isAdmin: opts.isAdmin ?? false,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      deletionReservedAt: opts.deletionReservedAt,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

async function seedEvent(t: Test, event: { title: string; startAt: number }) {
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

async function storeImage(t: Test, bytes: string) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: 'image/jpeg' }),
    )
    await (
      ctx.db as unknown as {
        patch: (
          id: Id<'_storage'>,
          value: { contentType: string },
        ) => Promise<void>
      }
    ).patch(storageId, { contentType: 'image/jpeg' })
    return storageId
  })
}

async function createReadyPhoto(
  t: Test,
  userId: Id<'users'>,
  opts: {
    caption?: string
    eventId?: string
    createdAt?: number
    tag: string
  },
) {
  const storageId = await storeImage(t, `img-${opts.tag}`)
  const thumbnailStorageId = await storeImage(t, `thumb-${opts.tag}`)
  const photoId = await t
    .withIdentity({ subject: userId })
    .mutation(api.gallery.createPhoto, {
      storageId,
      thumbnailStorageId,
      caption: opts.caption,
      eventId: opts.eventId,
      width: 800,
      height: 600,
    })

  if (opts.createdAt !== undefined) {
    const createdAt = opts.createdAt
    await t.run(async (ctx) => {
      const photo = await ctx.db.get(photoId)
      if (!photo) return
      await ctx.db.patch(photoId, { createdAt })
      const album = await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', photo.albumKey))
        .unique()
      if (!album) return
      const photosInAlbum = await ctx.db
        .query('photos')
        .withIndex('by_album', (q) => q.eq('albumKey', photo.albumKey))
        .order('desc')
        .collect()
      const newest = photosInAlbum[0]
      const newestReady = photosInAlbum.find(
        (item) => item.optimizationStatus === 'ready',
      )
      await ctx.db.patch(album._id, {
        latestPhotoAt: newest?.createdAt,
        coverPhotoId: newestReady?._id,
        coverThumbnailStorageId: newestReady?.thumbnailStorageId,
        coverOptimizedStorageId: newestReady?.optimizedStorageId,
        coverCreatedAt: newestReady?.createdAt,
      })
    })
  }

  return { photoId, storageId, thumbnailStorageId }
}

describe('updatePhoto og canEdit (#345)', () => {
  it('giver canEdit=true til uploader og admin, men false til andre medlemmer', async () => {
    const t = convexTest(schema, modules)
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const admin = await seedUser(t, {
      email: 'admin@example.com',
      fullName: 'Admin',
      isAdmin: true,
    })
    const other = await seedUser(t, {
      email: 'other@example.com',
      fullName: 'Andet Medlem',
    })

    const { photoId } = await createReadyPhoto(t, uploader.userId, {
      caption: 'Skovtur',
      tag: 'roles',
    })

    const asUploader = await t
      .withIdentity({ subject: uploader.userId })
      .query(api.gallery.getPhoto, { photoId })
    const asAdmin = await t
      .withIdentity({ subject: admin.userId })
      .query(api.gallery.getPhoto, { photoId })
    const asOther = await t
      .withIdentity({ subject: other.userId })
      .query(api.gallery.getPhoto, { photoId })
    const listAsOther = await t
      .withIdentity({ subject: other.userId })
      .query(api.gallery.listPhotos, {
        albumKey: 'without-event',
        paginationOpts: { numItems: 10, cursor: null },
      })

    expect(asUploader?.canEdit).toBe(true)
    expect(asAdmin?.canEdit).toBe(true)
    expect(asOther?.canEdit).toBe(false)
    expect(listAsOther.page[0]?.canEdit).toBe(false)
  })

  it('lader uploaderen rette billedtekst og knytte billedet fra "Uden begivenhed" til en begivenhed og tilbage igen', async () => {
    const t = convexTest(schema, modules)
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const eventId = await seedEvent(t, {
      title: 'Svampetur i skoven',
      startAt: 10_000,
    })
    const { photoId } = await createReadyPhoto(t, uploader.userId, {
      caption: 'Gammel tekst',
      tag: 'move-one',
    })

    const asUploader = t.withIdentity({ subject: uploader.userId })
    const updated = await asUploader.mutation(api.gallery.updatePhoto, {
      photoId,
      caption: 'Karl Johan under bøgen',
      eventId,
    })

    expect(updated).toEqual({
      id: photoId,
      caption: 'Karl Johan under bøgen',
      albumKey: eventId,
      eventId,
    })

    const inEventAlbum = await asUploader.query(api.gallery.listPhotos, {
      albumKey: eventId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    const inWithoutEvent = await asUploader.query(api.gallery.listPhotos, {
      albumKey: 'without-event',
      paginationOpts: { numItems: 10, cursor: null },
    })
    const albums = await asUploader.query(api.gallery.listAlbums, {})

    expect(inEventAlbum.page.map((p) => p.id)).toEqual([photoId])
    expect(inEventAlbum.page[0]?.caption).toBe('Karl Johan under bøgen')
    expect(inWithoutEvent.page).toEqual([])
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({
      albumId: eventId,
      title: 'Svampetur i skoven',
      photoCount: 1,
    })

    // Kan også rydde billedtekst og flytte tilbage til "Ingen begivenhed".
    await asUploader.mutation(api.gallery.updatePhoto, {
      photoId,
      caption: '   ',
      eventId: null,
    })
    const movedBack = await asUploader.query(api.gallery.getPhoto, { photoId })
    expect(movedBack).toMatchObject({
      caption: null,
      albumKey: 'without-event',
      eventId: null,
    })
  })

  it('håndhæver adgang pr. rolle: uploader og admin må, andet medlem afvises med NOT_PHOTO_OWNER', async () => {
    const t = convexTest(schema, modules)
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const admin = await seedUser(t, {
      email: 'admin@example.com',
      fullName: 'Admin',
      isAdmin: true,
    })
    const other = await seedUser(t, {
      email: 'other@example.com',
      fullName: 'Andet Medlem',
    })
    const deletingMember = await seedUser(t, {
      email: 'deleting@example.com',
      fullName: 'Slettes Snart',
    })

    const eventId = await seedEvent(t, { title: 'Fugletårn', startAt: 20_000 })
    const { photoId } = await createReadyPhoto(t, uploader.userId, {
      caption: 'Oprindelig',
      tag: 'auth',
    })
    const { photoId: deletingPhotoId } = await createReadyPhoto(
      t,
      deletingMember.userId,
      { caption: 'Låst', tag: 'deleting' },
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(deletingMember.profileId, {
        deletionReservedAt: Date.now(),
      })
    })

    // Uden login afvises med NOT_A_MEMBER.
    await expect(
      t.mutation(api.gallery.updatePhoto, {
        photoId,
        caption: 'Uden login',
      }),
    ).rejects.toThrow('NOT_A_MEMBER')

    // Konto med sletningsreservation må ikke skrive.
    await expect(
      t
        .withIdentity({ subject: deletingMember.userId })
        .mutation(api.gallery.updatePhoto, {
          photoId: deletingPhotoId,
          caption: 'Ny',
        }),
    ).rejects.toThrow('ACCOUNT_DELETION_RESERVED')

    // Et andet almindeligt medlem afvises, og billedet forbliver uændret.
    await expect(
      t
        .withIdentity({ subject: other.userId })
        .mutation(api.gallery.updatePhoto, {
          photoId,
          caption: 'Hacked',
          eventId,
        }),
    ).rejects.toThrow('NOT_PHOTO_OWNER')

    const untouched = await t
      .withIdentity({ subject: uploader.userId })
      .query(api.gallery.getPhoto, { photoId })
    expect(untouched).toMatchObject({
      caption: 'Oprindelig',
      albumKey: 'without-event',
    })

    // Admin kan rette og flytte et andet medlems billede.
    await t
      .withIdentity({ subject: admin.userId })
      .mutation(api.gallery.updatePhoto, {
        photoId,
        caption: 'Rettet af admin',
        eventId,
      })

    const updatedByAdmin = await t
      .withIdentity({ subject: uploader.userId })
      .query(api.gallery.getPhoto, { photoId })
    expect(updatedByAdmin).toMatchObject({
      caption: 'Rettet af admin',
      albumKey: eventId,
      eventId,
    })
  })
})

describe('movePhotos og albumvedligehold (#345)', () => {
  it('flytter flere billeder samlet, fjerner tomt "Uden begivenhed"-album og bevarer kommentarer og delte links', async () => {
    const t = convexTest(schema, modules)
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const commenter = await seedUser(t, {
      email: 'commenter@example.com',
      fullName: 'Kommentator',
    })
    const eventId = await seedEvent(t, {
      title: 'Kysttur ved Mols',
      startAt: 30_000,
    })

    const first = await createReadyPhoto(t, uploader.userId, {
      caption: 'Første billede',
      createdAt: 1000,
      tag: 'bulk-1',
    })
    const second = await createReadyPhoto(t, uploader.userId, {
      caption: 'Andet billede',
      createdAt: 2000,
      tag: 'bulk-2',
    })

    await t
      .withIdentity({ subject: commenter.userId })
      .mutation(api.gallery.addComment, {
        photoId: first.photoId,
        body: 'Flot lys over vandet!',
      })

    const beforeFirst = await t.run(async (ctx) => ctx.db.get(first.photoId))
    const displayToken = beforeFirst?.displayToken
    expect(displayToken).toBeTruthy()

    const asUploader = t.withIdentity({ subject: uploader.userId })
    const result = await asUploader.mutation(api.gallery.movePhotos, {
      photoIds: [first.photoId, second.photoId],
      eventId,
    })
    expect(result).toEqual({
      movedCount: 2,
      albumKey: eventId,
      eventId,
    })

    const after = await t.run(async (ctx) => ({
      albums: await ctx.db.query('photoAlbums').collect(),
      withoutEventAlbum: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', 'without-event'))
        .unique(),
    }))

    expect(after.withoutEventAlbum).toBeNull()
    expect(after.albums).toHaveLength(1)
    expect(after.albums[0]).toMatchObject({
      albumKey: eventId,
      eventId,
      title: 'Kysttur ved Mols',
      photoCount: 2,
      latestPhotoAt: 2000,
      coverPhotoId: second.photoId,
      coverThumbnailStorageId: second.thumbnailStorageId,
      coverOptimizedStorageId: second.storageId,
      coverCreatedAt: 2000,
    })

    // Kommentarer og delt link følger med billedet.
    const comments = await asUploader.query(api.gallery.listComments, {
      photoId: first.photoId,
    })
    expect(comments).toHaveLength(1)
    expect(comments[0]?.body).toBe('Flot lys over vandet!')
    const photoViewAfter = await asUploader.query(api.gallery.getPhoto, {
      photoId: first.photoId,
    })
    expect(photoViewAfter?.commentCount).toBe(1)
    const tokenLookup = await t.query(internal.gallery.photoForToken, {
      token: displayToken!,
      kind: 'display',
    })
    expect(tokenLookup?.storageId).toBe(first.storageId)
  })

  it('opdaterer tællere, cover og seneste dato korrekt på begge albums ved flytning mellem begivenheder og tomme album', async () => {
    const t = convexTest(schema, modules)
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const eventA = await seedEvent(t, { title: 'Album A', startAt: 1000 })
    const eventB = await seedEvent(t, { title: 'Album B', startAt: 2000 })

    const olderA = await createReadyPhoto(t, uploader.userId, {
      eventId: eventA,
      createdAt: 1000,
      tag: 'older-a',
    })
    const newerA = await createReadyPhoto(t, uploader.userId, {
      eventId: eventA,
      createdAt: 3000,
      tag: 'newer-a',
    })
    const middleB = await createReadyPhoto(t, uploader.userId, {
      eventId: eventB,
      createdAt: 2000,
      tag: 'middle-b',
    })

    const asUploader = t.withIdentity({ subject: uploader.userId })

    // Flyt nyeste billede fra A til B: A skal falde tilbage til olderA; B får newerA som cover.
    await asUploader.mutation(api.gallery.updatePhoto, {
      photoId: newerA.photoId,
      eventId: eventB,
    })

    const afterFirstMove = await t.run(async (ctx) => ({
      albumA: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', eventA))
        .unique(),
      albumB: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', eventB))
        .unique(),
    }))

    expect(afterFirstMove.albumA).toMatchObject({
      photoCount: 1,
      latestPhotoAt: 1000,
      coverPhotoId: olderA.photoId,
      coverThumbnailStorageId: olderA.thumbnailStorageId,
      coverCreatedAt: 1000,
    })
    expect(afterFirstMove.albumB).toMatchObject({
      photoCount: 2,
      latestPhotoAt: 3000,
      coverPhotoId: newerA.photoId,
      coverThumbnailStorageId: newerA.thumbnailStorageId,
      coverCreatedAt: 3000,
    })

    // Flyt olderA ind i B (som har newerA som nyere cover): coveret i B skal blive newerA.
    await asUploader.mutation(api.gallery.updatePhoto, {
      photoId: olderA.photoId,
      eventId: eventB,
    })

    const afterSecondMove = await t.run(async (ctx) => ({
      albumA: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', eventA))
        .unique(),
      albumB: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', eventB))
        .unique(),
    }))

    // Et begivenhedsalbum bliver stående som tomt med tæller 0 og uden cover.
    expect(afterSecondMove.albumA).toMatchObject({
      photoCount: 0,
      eventId: eventA,
    })
    expect(afterSecondMove.albumA?.coverPhotoId).toBeUndefined()
    expect(afterSecondMove.albumA?.latestPhotoAt).toBeUndefined()

    expect(afterSecondMove.albumB).toMatchObject({
      photoCount: 3,
      latestPhotoAt: 3000,
      coverPhotoId: newerA.photoId,
    })
    expect(middleB.photoId).toBeTruthy()
  })

  it('overskriver ikke coveret på et V1-migreret album uden coverCreatedAt med et ældre billede', async () => {
    const t = convexTest(schema, modules)
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const legacyKey = '7d3f2a10-9c4b-4e21-8f6a-1b2c3d4e5f60'
    const newerStorage = await storeImage(t, 'v1-newer')
    const newerThumb = await storeImage(t, 'v1-newer-thumb')

    const newerV1PhotoId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('photos', {
        storageId: newerStorage,
        optimizedStorageId: newerStorage,
        thumbnailStorageId: newerThumb,
        albumKey: legacyKey,
        eventId: legacyKey,
        uploaderId: uploader.profileId,
        createdAt: 5000,
        optimizationStatus: 'ready',
        optimizationAttempts: 0,
        commentCount: 0,
        displayToken: 'tok1',
        thumbnailToken: 'tok2',
      })
      await ctx.db.insert('photoAlbums', {
        albumKey: legacyKey,
        eventId: legacyKey,
        title: 'Hornfisketur 2024',
        photoCount: 1,
        latestPhotoAt: 5000,
        coverPhotoId: id,
        // `migrateV1.ts` sætter ikke `coverCreatedAt`.
      })
      return id
    })

    const older = await createReadyPhoto(t, uploader.userId, {
      createdAt: 2000,
      tag: 'older-moved',
    })

    await t
      .withIdentity({ subject: uploader.userId })
      .mutation(api.gallery.updatePhoto, {
        photoId: older.photoId,
        eventId: legacyKey,
      })

    const album = await t.run(async (ctx) =>
      ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', legacyKey))
        .unique(),
    )
    expect(album).toMatchObject({
      photoCount: 2,
      coverPhotoId: newerV1PhotoId,
      latestPhotoAt: 5000,
      title: 'Hornfisketur 2024',
    })
  })

  it('håndhæver roller, atomicitet, validering og idempotens i movePhotos og updatePhoto', async () => {
    const t = convexTest(schema, modules)
    const alice = await seedUser(t, {
      email: 'alice@example.com',
      fullName: 'Alice',
    })
    const bob = await seedUser(t, {
      email: 'bob@example.com',
      fullName: 'Bob',
    })
    const admin = await seedUser(t, {
      email: 'admin@example.com',
      fullName: 'Admin',
      isAdmin: true,
    })
    const eventId = await seedEvent(t, { title: 'Fællestur', startAt: 40_000 })

    const alicePhoto = await createReadyPhoto(t, alice.userId, {
      tag: 'alice',
    })
    const bobPhoto = await createReadyPhoto(t, bob.userId, {
      tag: 'bob',
    })

    // Alice må ikke masseflytte Bobs billede -- og hvis hendes eget er med i samme kald, flyttes intet.
    await expect(
      t
        .withIdentity({ subject: alice.userId })
        .mutation(api.gallery.movePhotos, {
          photoIds: [alicePhoto.photoId, bobPhoto.photoId],
          eventId,
        }),
    ).rejects.toThrow('NOT_PHOTO_OWNER')

    const afterRejected = await t.run(async (ctx) => ({
      alice: await ctx.db.get(alicePhoto.photoId),
      bob: await ctx.db.get(bobPhoto.photoId),
    }))
    expect(afterRejected.alice?.albumKey).toBe('without-event')
    expect(afterRejected.bob?.albumKey).toBe('without-event')

    // Validerer længde og ukendt begivenhed.
    await expect(
      t
        .withIdentity({ subject: alice.userId })
        .mutation(api.gallery.updatePhoto, {
          photoId: alicePhoto.photoId,
          caption: 'x'.repeat(501),
        }),
    ).rejects.toThrow('PHOTO_CAPTION_TOO_LONG')
    await expect(
      t
        .withIdentity({ subject: alice.userId })
        .mutation(api.gallery.movePhotos, {
          photoIds: [alicePhoto.photoId],
          eventId: 'ukendt-tur',
        }),
    ).rejects.toThrow('PHOTO_EVENT_NOT_FOUND')

    // Admin kan flytte billeder fra flere medlemmer på én gang; dubletter tælles ikke dobbelt.
    const adminMove = await t
      .withIdentity({ subject: admin.userId })
      .mutation(api.gallery.movePhotos, {
        photoIds: [alicePhoto.photoId, alicePhoto.photoId, bobPhoto.photoId],
        eventId,
      })
    expect(adminMove.movedCount).toBe(2)

    // Gentaget kald til samme album er idempotent og ændrer ikke tælleren.
    const repeatMove = await t
      .withIdentity({ subject: admin.userId })
      .mutation(api.gallery.movePhotos, {
        photoIds: [alicePhoto.photoId, bobPhoto.photoId],
        eventId,
      })
    expect(repeatMove.movedCount).toBe(0)

    const album = await t.run(async (ctx) =>
      ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', eventId))
        .unique(),
    )
    expect(album?.photoCount).toBe(2)

    // Serveren afviser over 100 unikke billeder i ét kald (B1).
    const tooManyPhotoIds = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(['x'], { type: 'image/jpeg' }),
      )
      return await Promise.all(
        Array.from({ length: 101 }, () =>
          ctx.db.insert('photos', {
            storageId,
            albumKey: 'without-event',
            uploaderId: admin.profileId,
            createdAt: 1,
            optimizationStatus: 'ready',
            optimizationAttempts: 0,
            commentCount: 0,
          }),
        ),
      )
    })
    await expect(
      t
        .withIdentity({ subject: admin.userId })
        .mutation(api.gallery.movePhotos, {
          photoIds: tooManyPhotoIds,
          eventId,
        }),
    ).rejects.toThrow('TOO_MANY_PHOTOS')
  })

  it('afviser flytning til en slettet V2-begivenhed med PHOTO_EVENT_NOT_FOUND, men tillader rettelse af billedtekst på billede der allerede ligger der (#353)', async () => {
    const t = setup()
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const asUploader = t.withIdentity({ subject: uploader.userId })

    const { eventId } = await asUploader.mutation(api.calendar.createEvent, {
      title: 'Tur der slettes',
      description: null,
      location: null,
      startAt: 50_000,
      endAt: null,
      isPublic: false,
      maxParticipants: null,
    })

    // Et tomt album efter sletning af både billede og begivenhed.
    const removed = await createReadyPhoto(t, uploader.userId, {
      eventId,
      tag: 'removed',
    })
    const stayingOnDeleted = await createReadyPhoto(t, uploader.userId, {
      eventId,
      caption: 'Før rettelse',
      tag: 'staying',
    })
    const other = await createReadyPhoto(t, uploader.userId, {
      caption: 'Uden begivenhed',
      tag: 'other',
    })

    await asUploader.mutation(api.gallery.deletePhoto, {
      photoId: removed.photoId,
    })
    await asUploader.mutation(api.calendar.deleteEvent, { eventId })

    await expect(
      asUploader.mutation(api.gallery.movePhotos, {
        photoIds: [other.photoId],
        eventId,
      }),
    ).rejects.toThrow('PHOTO_EVENT_NOT_FOUND')

    await expect(
      asUploader.mutation(api.gallery.updatePhoto, {
        photoId: other.photoId,
        eventId,
      }),
    ).rejects.toThrow('PHOTO_EVENT_NOT_FOUND')

    // Et billede, der allerede ligger på den slettede begivenhed, kan stadig få rettet sin billedtekst.
    const edited = await asUploader.mutation(api.gallery.updatePhoto, {
      photoId: stayingOnDeleted.photoId,
      caption: 'Rettet efter sletning',
      eventId,
    })
    expect(edited).toMatchObject({
      caption: 'Rettet efter sletning',
      albumKey: eventId,
      eventId,
    })
  })

  it('skjuler tomme begivenhedsalbum (0 billeder) på albumforsiden og viser dem igen ved ny tilknytning (#354)', async () => {
    const t = setup()
    const uploader = await seedUser(t, {
      email: 'uploader@example.com',
      fullName: 'Uploader',
    })
    const asUploader = t.withIdentity({ subject: uploader.userId })

    const eventA = await seedEvent(t, { title: 'Fugletur', startAt: 10_000 })
    const eventB = await seedEvent(t, { title: 'Skovtur', startAt: 20_000 })
    const photo = await createReadyPhoto(t, uploader.userId, {
      eventId: eventA,
      tag: 'move-empty',
    })

    // Flyt eneste billede væk fra eventA: eventA må ikke stå som "0 billeder" i listAlbums.
    await asUploader.mutation(api.gallery.updatePhoto, {
      photoId: photo.photoId,
      eventId: eventB,
    })
    const albumsAfterMoveOut = await asUploader.query(
      api.gallery.listAlbums,
      {},
    )
    expect(albumsAfterMoveOut.map((album) => album.albumId)).toEqual([eventB])

    // Flyt billedet tilbage til eventA: nu dukker eventA op igen med 1 billede og eventB forsvinder.
    await asUploader.mutation(api.gallery.updatePhoto, {
      photoId: photo.photoId,
      eventId: eventA,
    })
    const albumsAfterMoveBack = await asUploader.query(
      api.gallery.listAlbums,
      {},
    )
    expect(albumsAfterMoveBack).toHaveLength(1)
    expect(albumsAfterMoveBack[0]).toMatchObject({
      albumId: eventA,
      title: 'Fugletur',
      photoCount: 1,
    })
  })
})
