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

async function seedEvent(
  t: ReturnType<typeof convexTest>,
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
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Hornfisketur', startAt: 1000 })
    const storageId = await storeImage(t, 'visning')

    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
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
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Fugletårnet', startAt: 2000 })
    const asMember = t.withIdentity({ subject: member.userId })

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
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Aflyst tur', startAt: 3000 })
    await t.run(async (ctx) => ctx.db.delete(eventId))
    const storageId = await storeImage(t, 'visning')

    // Billedet må ikke gå tabt, fordi turen blev slettet, mens uploaden lå i
    // køen -- og albummet må ikke komme til at hedde "Ukendt begivenhed".
    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, { storageId, eventId })

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
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const storageId = await storeImage(t, 'visning')

    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
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
    const t = convexTest(schema, modules)
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

    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, { storageId, eventId: legacyKey })

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
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Gammelt navn', startAt: 1000 })
    const asMember = t.withIdentity({ subject: member.userId })

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

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'admin@example.com' })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: 'Admin Medlem',
      isAdmin: true,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

async function seedOtherMember(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'anden@example.com' })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: 'Anden Medlem',
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

describe('movePhoto (#350)', () => {
  it('flytter et billede uden begivenhed ind i en begivenheds album', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Hornfisketur', startAt: 1000 })
    const asMember = t.withIdentity({ subject: member.userId })
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'visning'),
      thumbnailStorageId: await storeImage(t, 'mini'),
      caption: 'Et blad',
    })

    await asMember.mutation(api.gallery.movePhoto, { photoId, eventId })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      albums: await ctx.db.query('photoAlbums').collect(),
    }))
    expect(after.photo).toMatchObject({ albumKey: eventId, eventId })
    // Billedteksten følger billedet.
    expect(after.photo?.caption).toBe('Et blad')
    // Det tomme "Uden begivenhed"-album ryddes op, som ved en sletning.
    expect(after.albums).toHaveLength(1)
    expect(after.albums[0]).toMatchObject({
      albumKey: eventId,
      title: 'Hornfisketur',
      photoCount: 1,
      // Et album, flytningen lige har oprettet, får billedet som forside.
      coverPhotoId: photoId,
    })
  })

  it('flytter et billede væk fra begivenheden, til "Uden begivenhed"', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Fugletårnet', startAt: 2000 })
    const asMember = t.withIdentity({ subject: member.userId })
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'visning'),
      eventId,
    })

    await asMember.mutation(api.gallery.movePhoto, { photoId })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      albums: await ctx.db.query('photoAlbums').collect(),
    }))
    expect(after.photo).toMatchObject({ albumKey: 'without-event' })
    expect(after.photo?.eventId).toBeUndefined()
    // Begivenhedens album bliver stående som tomt, så det stadig kan findes
    // fra kalenderen -- samme regel som `removePhotoFromAlbum` har.
    const byKey = Object.fromEntries(
      after.albums.map((album) => [album.albumKey, album.photoCount]),
    )
    expect(byKey).toEqual({ [eventId]: 0, 'without-event': 1 })
  })

  it('retter tællere og forside i det album, billedet forlader', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const fra = await seedEvent(t, { title: 'Fra-tur', startAt: 1000 })
    const til = await seedEvent(t, { title: 'Til-tur', startAt: 2000 })
    const asMember = t.withIdentity({ subject: member.userId })

    const bliver = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'et'),
      thumbnailStorageId: await storeImage(t, 'et-mini'),
      eventId: fra,
    })
    const flyttes = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'to'),
      thumbnailStorageId: await storeImage(t, 'to-mini'),
      eventId: fra,
    })
    // Det nyeste billede er forsiden; flyttes netop det, skal albummet finde
    // en ny.
    const before = await t.run(async (ctx) =>
      ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', fra))
        .unique(),
    )
    expect(before?.coverPhotoId).toBe(flyttes)

    await asMember.mutation(api.gallery.movePhoto, {
      photoId: flyttes,
      eventId: til,
    })

    const albums = await t.run(async (ctx) =>
      ctx.db.query('photoAlbums').collect(),
    )
    const fraAlbum = albums.find((album) => album.albumKey === fra)
    const tilAlbum = albums.find((album) => album.albumKey === til)
    expect(fraAlbum).toMatchObject({ photoCount: 1, coverPhotoId: bliver })
    expect(tilAlbum).toMatchObject({
      photoCount: 1,
      title: 'Til-tur',
      coverPhotoId: flyttes,
    })
  })

  it('beholder kommentarerne på billedet', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Kommentartur', startAt: 1000 })
    const asMember = t.withIdentity({ subject: member.userId })
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'visning'),
    })
    await asMember.mutation(api.gallery.addComment, {
      photoId,
      body: 'Flot fugl',
    })

    await asMember.mutation(api.gallery.movePhoto, { photoId, eventId })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      comments: await ctx.db
        .query('photoComments')
        .withIndex('by_photo', (q) => q.eq('photoId', photoId))
        .collect(),
    }))
    expect(after.comments).toHaveLength(1)
    expect(after.comments[0]?.body).toBe('Flot fugl')
    expect(after.photo?.commentCount).toBe(1)
  })

  it('lader en administrator flytte et andet medlems billede', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const admin = await seedAdmin(t)
    const eventId = await seedEvent(t, { title: 'Oprydning', startAt: 1000 })
    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
        storageId: await storeImage(t, 'visning'),
      })

    await t
      .withIdentity({ subject: admin.userId })
      .mutation(api.gallery.movePhoto, { photoId, eventId })

    const photo = await t.run(async (ctx) => ctx.db.get(photoId))
    expect(photo).toMatchObject({ albumKey: eventId })
  })

  it('afviser et medlem, der hverken er uploader eller administrator', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const other = await seedOtherMember(t)
    const eventId = await seedEvent(t, { title: 'Ikke din tur', startAt: 1000 })
    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
        storageId: await storeImage(t, 'visning'),
      })

    await expect(
      t
        .withIdentity({ subject: other.userId })
        .mutation(api.gallery.movePhoto, { photoId, eventId }),
    ).rejects.toThrow(/PHOTO_MOVE_NOT_AUTHORIZED/)

    const photo = await t.run(async (ctx) => ctx.db.get(photoId))
    expect(photo).toMatchObject({ albumKey: 'without-event' })
  })

  it('afviser en, der slet ikke er logget ind', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const photoId = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.gallery.createPhoto, {
        storageId: await storeImage(t, 'visning'),
      })

    await expect(
      t.mutation(api.gallery.movePhoto, { photoId }),
    ).rejects.toThrow()
  })

  it('rører ikke albummet, når billedet allerede ligger i det', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'Samme tur', startAt: 1000 })
    const asMember = t.withIdentity({ subject: member.userId })

    const ældre = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'et'),
      thumbnailStorageId: await storeImage(t, 'et-mini'),
      eventId,
    })
    const forside = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'to'),
      thumbnailStorageId: await storeImage(t, 'to-mini'),
      eventId,
    })

    // Flytning til det album, billedet allerede er i. Går den gennem
    // fjern-og-tilføj, ser `removePhotoFromAlbum` at forsiden er netop dette
    // billede og vælger en ny -- og så har en flytning, der ikke flyttede
    // noget, skiftet albummets forside.
    await asMember.mutation(api.gallery.movePhoto, {
      photoId: forside,
      eventId,
    })

    const albums = await t.run(async (ctx) =>
      ctx.db.query('photoAlbums').collect(),
    )
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({
      albumKey: eventId,
      photoCount: 2,
      coverPhotoId: forside,
    })
    expect(ældre).not.toBe(forside)
  })

  it('flytter til "Uden begivenhed", hvis begivenheden ikke findes', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, {
      title: 'En rigtig tur',
      startAt: 1000,
    })
    const asMember = t.withIdentity({ subject: member.userId })
    // Billedet skal ligge i et begivenhedsalbum, så flytningen faktisk kører:
    // lå det i forvejen i "Uden begivenhed", ville genvejen returnere først,
    // og testen ville bevise ingenting.
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'visning'),
      eventId,
    })

    await asMember.mutation(api.gallery.movePhoto, {
      photoId,
      eventId: 'ikke-et-id',
    })

    const photo = await t.run(async (ctx) => ctx.db.get(photoId))
    expect(photo).toMatchObject({ albumKey: 'without-event' })
    expect(photo?.eventId).toBeUndefined()
  })

  it('sætter ikke en begivenhed på "Uden begivenhed"-albummet', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'En tur', startAt: 1000 })
    const asMember = t.withIdentity({ subject: member.userId })

    // "Uden begivenhed"-albummet skal findes i forvejen, ellers rammer
    // opslaget i `albumTargetFor` ikke den gren, der skal prøves.
    await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'bliver'),
    })
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'flyttes'),
      eventId,
    })

    // 'without-event' er albumnøglen, ikke et begivenheds-id. Uden guarden
    // ville billedet få `eventId: 'without-event'`, og `addPhotoToAlbum`
    // ville sætte et `eventId` på selve "Uden begivenhed"-albummet -- så blev
    // det aldrig ryddet op og lagde sig blandt begivenhedsalbummene.
    await asMember.mutation(api.gallery.movePhoto, {
      photoId,
      eventId: 'without-event',
    })

    const after = await t.run(async (ctx) => ({
      photo: await ctx.db.get(photoId),
      album: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', 'without-event'))
        .unique(),
    }))
    expect(after.photo).toMatchObject({ albumKey: 'without-event' })
    expect(after.photo?.eventId).toBeUndefined()
    expect(after.album?.eventId).toBeUndefined()
  })

  it('lader ikke et tømt album påstå en dato, det ikke har', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const tomt = await seedEvent(t, { title: 'Tømmes', startAt: 1000 })
    const andet = await seedEvent(t, { title: 'Andet', startAt: 2000 })
    const asMember = t.withIdentity({ subject: member.userId })
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'visning'),
      eventId: tomt,
    })

    await asMember.mutation(api.gallery.movePhoto, { photoId, eventId: andet })

    const albums = await t.run(async (ctx) =>
      ctx.db.query('photoAlbums').collect(),
    )
    const tømt = albums.find((album) => album.albumKey === tomt)
    // `latestPhotoAt` sorterer album-forsiden og skriver "senest <dato>". Blev
    // den stående, stod det tomme album først med "0 billeder · senest i dag".
    expect(tømt).toMatchObject({ photoCount: 0 })
    expect(tømt?.latestPhotoAt).toBeUndefined()
  })

  it('retter datoen til det nyeste billede, der bliver tilbage', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const eventId = await seedEvent(t, { title: 'To billeder', startAt: 1000 })
    const asMember = t.withIdentity({ subject: member.userId })
    const aeldre = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'et'),
      eventId,
    })
    const nyere = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'to'),
      eventId,
    })

    await asMember.mutation(api.gallery.movePhoto, { photoId: nyere })

    const after = await t.run(async (ctx) => ({
      album: await ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', eventId))
        .unique(),
      remaining: await ctx.db.get(aeldre),
    }))
    expect(after.album).toMatchObject({ photoCount: 1 })
    expect(after.album?.latestPhotoAt).toBe(after.remaining?.createdAt)
  })

  it('bliver forside, når det flyttede billede er nyere end den nuværende', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t)
    const fra = await seedEvent(t, { title: 'Fra', startAt: 1000 })
    const til = await seedEvent(t, { title: 'Til', startAt: 2000 })
    const asMember = t.withIdentity({ subject: member.userId })

    const gammelForside = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'gammel'),
      thumbnailStorageId: await storeImage(t, 'gammel-mini'),
      eventId: til,
    })
    const nyere = await asMember.mutation(api.gallery.createPhoto, {
      storageId: await storeImage(t, 'ny'),
      thumbnailStorageId: await storeImage(t, 'ny-mini'),
      eventId: fra,
    })

    await asMember.mutation(api.gallery.movePhoto, {
      photoId: nyere,
      eventId: til,
    })

    const album = await t.run(async (ctx) =>
      ctx.db
        .query('photoAlbums')
        .withIndex('by_album_key', (q) => q.eq('albumKey', til))
        .unique(),
    )
    // Forsiden er "nyeste klare billede", som skemaet og `createPhoto` siger.
    expect(album?.coverPhotoId).toBe(nyere)
    expect(gammelForside).not.toBe(nyere)
  })
})
