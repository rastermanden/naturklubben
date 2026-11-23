// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestConvex, withAuthUser } from '../test/convexTestAuth'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  MAX_FILE_SIZE,
  MAX_VIDEO_BYTES,
  normalizeVideoMime,
  sliceReadableStream,
} from './gallery'

function setup() {
  return createTestConvex()
}

type Test = ReturnType<typeof setup>

async function seedMember(
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

/**
 * `storage.store` i convex-test sætter ikke altid `contentType` på `_storage`-rækken.
 * Et rigtigt upload gør, så testen sætter feltet eksplicit.
 */
async function storeFile(
  t: Test,
  content: BlobPart,
  contentType?: string,
): Promise<Id<'_storage'>> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([content], contentType ? { type: contentType } : undefined),
    )
    if (contentType !== undefined) {
      await (
        ctx.db as unknown as {
          patch: (
            id: Id<'_storage'>,
            value: { contentType: string },
          ) => Promise<void>
        }
      ).patch(storageId, { contentType })
    }
    return storageId
  })
}

const SITE_URL = 'https://galleri-video-test.convex.site'
let previousSiteUrl: string | undefined

function envMap(): Record<string, string | undefined> {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  if (!g.process) g.process = { env: {} }
  if (!g.process.env) g.process.env = {}
  return g.process.env
}

beforeEach(() => {
  const env = envMap()
  previousSiteUrl = env.CONVEX_SITE_URL
  env.CONVEX_SITE_URL = SITE_URL
})

afterEach(() => {
  vi.restoreAllMocks()
  const env = envMap()
  if (previousSiteUrl === undefined) {
    delete env.CONVEX_SITE_URL
  } else {
    env.CONVEX_SITE_URL = previousSiteUrl
  }
})

describe('normalizeVideoMime', () => {
  it('accepterer mp4, webm og quicktime inkl. codecs og afviser andre typer', () => {
    expect(normalizeVideoMime('video/mp4')).toBe('video/mp4')
    expect(normalizeVideoMime('VIDEO/WEBM; codecs="vp9,opus"')).toBe(
      'video/webm',
    )
    expect(normalizeVideoMime('video/quicktime')).toBe('video/quicktime')
    expect(normalizeVideoMime('video/x-msvideo')).toBeNull()
    expect(normalizeVideoMime('audio/mpeg')).toBeNull()
    expect(normalizeVideoMime('image/jpeg')).toBeNull()
    expect(normalizeVideoMime(undefined)).toBeNull()
  })
})

describe('video autorisation og roller', () => {
  it('afviser uautentificerede, ikke-medlemmer og profiler med sletningsreservation', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'medlem@example.com',
      fullName: 'Medlem',
    })
    const deleting = await seedMember(t, {
      email: 'slettes@example.com',
      fullName: 'Slettes',
      deletionReservedAt: Date.now(),
    })
    const nonMemberUserId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'gaest@example.com' }),
    )

    const videoStorageId = await storeFile(t, 'mp4-bytes', 'video/mp4')
    const created = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.gallery.createVideo, {
      storageId: videoStorageId,
      caption: 'Rådyr i skovkanten',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('expected video')

    // Gæst uden login afvises på alle offentlige endpoints.
    await expect(t.query(api.gallery.listAlbums, {})).rejects.toThrow(
      'NOT_A_MEMBER',
    )
    await expect(
      t.query(api.gallery.listPhotos, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow('NOT_A_MEMBER')
    await expect(
      t.query(api.gallery.getPhoto, { photoId: created.id }),
    ).rejects.toThrow('NOT_A_MEMBER')
    await expect(t.mutation(api.gallery.generateUploadUrl, {})).rejects.toThrow(
      'NOT_A_MEMBER',
    )
    await expect(
      t.mutation(api.gallery.createVideo, { storageId: videoStorageId }),
    ).rejects.toThrow('NOT_A_MEMBER')
    await expect(
      t.mutation(api.gallery.deletePhoto, { photoId: created.id }),
    ).rejects.toThrow('NOT_A_MEMBER')

    // Indlogget uden medlemsprofil afvises også.
    const asNonMember = await withAuthUser(t, nonMemberUserId)
    await expect(asNonMember.query(api.gallery.listAlbums, {})).rejects.toThrow(
      'NOT_A_MEMBER',
    )
    await expect(
      asNonMember.mutation(api.gallery.createVideo, {
        storageId: videoStorageId,
      }),
    ).rejects.toThrow('NOT_A_MEMBER')

    // Medlem med aktiv sletningsreservation afvises ved skrivning.
    const asDeleting = await withAuthUser(t, deleting.userId)
    const deletingStorage = await storeFile(t, 'blocked-mp4', 'video/mp4')
    await expect(
      asDeleting.mutation(api.gallery.createVideo, {
        storageId: deletingStorage,
      }),
    ).rejects.toThrow('ACCOUNT_DELETION_RESERVED')
  })
})

describe('video upload-validering på serveren', () => {
  it('accepterer mp4, webm og mov med valgfri miniature og begivenhed, og beholder legacy-billeder uændret', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'video@example.com',
      fullName: 'Video Medlem',
    })
    const eventId = await seedEvent(t, { title: 'Vintertur', startAt: 1000 })
    const asMember = await withAuthUser(t, member.userId)

    // Eksisterende legacy-billede uden mediaKind forbliver et billede.
    const legacyImageStorage = await storeFile(t, 'legacy-img', 'image/jpeg')
    const legacyPhotoId = await t.run((ctx) =>
      ctx.db.insert('photos', {
        storageId: legacyImageStorage,
        albumKey: 'without-event',
        uploaderId: member.profileId,
        createdAt: 500,
        optimizationStatus: 'ready',
        optimizationAttempts: 0,
        commentCount: 0,
        displayToken: 'legacy-disp',
        thumbnailToken: 'legacy-thumb',
      }),
    )

    const mp4Id = await storeFile(t, 'mp4-data', 'video/mp4')
    const thumbId = await storeFile(t, 'jpeg-thumb', 'image/jpeg')
    const webmId = await storeFile(
      t,
      'webm-data',
      'video/webm; codecs="vp9,opus"',
    )
    const movId = await storeFile(t, 'mov-data', 'video/quicktime')

    const resMp4 = await asMember.mutation(api.gallery.createVideo, {
      storageId: mp4Id,
      thumbnailStorageId: thumbId,
      width: 400,
      height: 225,
      caption: 'Isfugl ved åen',
      eventId,
      clientUploadId: 'vid-mp4-1',
    })
    const resWebm = await asMember.mutation(api.gallery.createVideo, {
      storageId: webmId,
      caption: 'Webm uden miniature',
    })
    const resMov = await asMember.mutation(api.gallery.createVideo, {
      storageId: movId,
      eventId,
    })

    expect(resMp4.ok).toBe(true)
    expect(resWebm.ok).toBe(true)
    expect(resMov.ok).toBe(true)
    if (!resMp4.ok || !resWebm.ok || !resMov.ok) {
      throw new Error('expected videos')
    }

    // Idempotent genforsøg med samme clientUploadId opretter ikke dublet.
    const dupMp4 = await storeFile(t, 'dup-mp4', 'video/mp4')
    const retryRes = await asMember.mutation(api.gallery.createVideo, {
      storageId: dupMp4,
      caption: 'Opdateret tekst',
      clientUploadId: 'vid-mp4-1',
    })
    expect(retryRes).toEqual({ ok: true, id: resMp4.id })
    expect(await t.run((ctx) => ctx.storage.getUrl(dupMp4))).toBeNull()

    const legacyView = await asMember.query(api.gallery.getPhoto, {
      photoId: legacyPhotoId,
    })
    expect(legacyView).toMatchObject({
      mediaKind: 'image',
      displayUrl: `${SITE_URL}/photo?token=legacy-disp`,
      thumbnailUrl: `${SITE_URL}/photo?token=legacy-thumb`,
    })

    const mp4View = await asMember.query(api.gallery.getPhoto, {
      photoId: resMp4.id,
    })
    expect(mp4View).toMatchObject({
      mediaKind: 'video',
      mimeType: 'video/mp4',
      caption: 'Opdateret tekst',
      eventId,
      albumKey: eventId,
    })
    expect(mp4View?.displayUrl).toMatch(
      /^https:\/\/galleri-video-test\.convex\.site\/video\?token=[a-f0-9]+$/,
    )
    expect(mp4View?.thumbnailUrl).toMatch(
      /^https:\/\/galleri-video-test\.convex\.site\/photo\?token=[a-f0-9]+$/,
    )

    const webmView = await asMember.query(api.gallery.getPhoto, {
      photoId: resWebm.id,
    })
    expect(webmView).toMatchObject({
      mediaKind: 'video',
      mimeType: 'video/webm',
      thumbnailUrl: null,
    })

    const albums = await asMember.query(api.gallery.listAlbums, {})
    const eventAlbum = albums.find((a) => a.albumId === eventId)
    expect(eventAlbum?.photoCount).toBe(2)
    expect(eventAlbum?.coverIsVideo).toBe(true)
    expect(eventAlbum?.coverUrl).toBeNull()
  })

  it('afviser forkerte typer, tomme filer, video over 50 MB og billeder over 15 MB med sletning af afviste filer', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'val@example.com',
      fullName: 'Validering',
    })
    const other = await seedMember(t, {
      email: 'other@example.com',
      fullName: 'Anden',
    })
    const asMember = await withAuthUser(t, member.userId)

    // Forkerte MIME-typer afvises og slettes fra storage (inkl. medfølgende thumb).
    for (const badMime of [
      'video/x-msvideo',
      'video/ogg',
      'audio/mpeg',
      'image/jpeg',
      undefined,
    ]) {
      const badStorage = await storeFile(t, 'ugyldig', badMime)
      const thumbStorage = await storeFile(t, 'thumb', 'image/jpeg')
      const res = await asMember.mutation(api.gallery.createVideo, {
        storageId: badStorage,
        thumbnailStorageId: thumbStorage,
      })
      expect(res).toEqual({ ok: false, error: 'VIDEO_UNSUPPORTED_TYPE' })
      expect(await t.run((ctx) => ctx.storage.getUrl(badStorage))).toBeNull()
      expect(await t.run((ctx) => ctx.storage.getUrl(thumbStorage))).toBeNull()
    }

    // Tom video afvises og slettes.
    const emptyId = await storeFile(t, new Uint8Array(0), 'video/mp4')
    expect(
      await asMember.mutation(api.gallery.createVideo, { storageId: emptyId }),
    ).toEqual({ ok: false, error: 'VIDEO_EMPTY' })
    expect(await t.run((ctx) => ctx.storage.getUrl(emptyId))).toBeNull()

    // Video over 50 MB afvises og slettes; præcis 50 MB accepteres.
    const tooLargeVideo = await storeFile(
      t,
      new Uint8Array(MAX_VIDEO_BYTES + 1),
      'video/mp4',
    )
    expect(
      await asMember.mutation(api.gallery.createVideo, {
        storageId: tooLargeVideo,
      }),
    ).toEqual({ ok: false, error: 'VIDEO_TOO_LARGE' })
    expect(await t.run((ctx) => ctx.storage.getUrl(tooLargeVideo))).toBeNull()

    const exact50MbVideo = await storeFile(
      t,
      new Uint8Array(MAX_VIDEO_BYTES),
      'video/mp4',
    )
    const ok50Mb = await asMember.mutation(api.gallery.createVideo, {
      storageId: exact50MbVideo,
      caption: 'Præcis 50 MB',
    })
    expect(ok50Mb.ok).toBe(true)

    // Billeder beholder 15 MB-grænsen og createPhoto afviser videoer.
    const tooLargeImage = await storeFile(
      t,
      new Uint8Array(MAX_FILE_SIZE + 1),
      'image/jpeg',
    )
    await expect(
      asMember.mutation(api.gallery.createPhoto, { storageId: tooLargeImage }),
    ).rejects.toThrow('PHOTO_TOO_LARGE')

    const videoAsPhoto = await storeFile(t, 'mp4', 'video/mp4')
    await expect(
      asMember.mutation(api.gallery.createPhoto, { storageId: videoAsPhoto }),
    ).rejects.toThrow('PHOTO_NOT_AN_IMAGE')

    // Ugyldig miniature afvises og rydder op; andres eksisterende storageId beskyttes.
    const goodVideo = await storeFile(t, 'good-vid', 'video/mp4')
    const badThumb = await storeFile(t, 'not-img', 'text/plain')
    expect(
      await asMember.mutation(api.gallery.createVideo, {
        storageId: goodVideo,
        thumbnailStorageId: badThumb,
      }),
    ).toEqual({ ok: false, error: 'VIDEO_THUMBNAIL_INVALID' })
    expect(await t.run((ctx) => ctx.storage.getUrl(goodVideo))).toBeNull()
    expect(await t.run((ctx) => ctx.storage.getUrl(badThumb))).toBeNull()

    const otherVideoStorage = await storeFile(t, 'other-vid', 'video/mp4')
    await (
      await withAuthUser(t, other.userId)
    ).mutation(api.gallery.createVideo, { storageId: otherVideoStorage })

    expect(
      await asMember.mutation(api.gallery.createVideo, {
        storageId: otherVideoStorage,
      }),
    ).toEqual({ ok: false, error: 'VIDEO_UPLOAD_NOT_FOUND' })
    expect(
      await t.run((ctx) => ctx.storage.getUrl(otherVideoStorage)),
    ).not.toBeNull()
  })
})

describe('redigering, flytning, sletning, kontosletning og eksport for videoer', () => {
  it('lader ejer og admin redigere og masseflytte videoer og sletter original + miniature fra storage', async () => {
    const t = setup()
    const uploader = await seedMember(t, {
      email: 'ejer@example.com',
      fullName: 'Ejer',
    })
    const other = await seedMember(t, {
      email: 'anden@example.com',
      fullName: 'Anden',
    })
    const admin = await seedMember(t, {
      email: 'admin@example.com',
      fullName: 'Admin',
      isAdmin: true,
    })
    const eventId = await seedEvent(t, { title: 'Kysttur', startAt: 2000 })
    const asUploader = await withAuthUser(t, uploader.userId)
    const asOther = await withAuthUser(t, other.userId)
    const asAdmin = await withAuthUser(t, admin.userId)

    const vid1Storage = await storeFile(t, 'vid-1', 'video/mp4')
    const vid1Thumb = await storeFile(t, 'thumb-1', 'image/jpeg')
    const vid2Storage = await storeFile(t, 'vid-2', 'video/webm')
    const photoStorage = await storeFile(t, 'img-1', 'image/jpeg')

    const v1 = await asUploader.mutation(api.gallery.createVideo, {
      storageId: vid1Storage,
      thumbnailStorageId: vid1Thumb,
      caption: 'Bølger',
    })
    const v2 = await asUploader.mutation(api.gallery.createVideo, {
      storageId: vid2Storage,
      caption: 'Måger',
    })
    const p1 = await asUploader.mutation(api.gallery.createPhoto, {
      storageId: photoStorage,
      thumbnailStorageId: await storeFile(t, 'img-thumb', 'image/jpeg'),
      caption: 'Krabbe',
    })
    if (!v1.ok || !v2.ok) throw new Error('expected videos')

    // Andet medlem kan ikke redigere eller slette videoen.
    await expect(
      asOther.mutation(api.gallery.updatePhoto, {
        photoId: v1.id,
        caption: 'Hacked',
      }),
    ).rejects.toThrow('NOT_PHOTO_OWNER')
    await expect(
      asOther.mutation(api.gallery.deletePhoto, { photoId: v1.id }),
    ).rejects.toThrow('PHOTO_DELETE_NOT_AUTHORIZED')

    // Redigér video: ret billedtekst og flyt til begivenhed.
    await asUploader.mutation(api.gallery.updatePhoto, {
      photoId: v1.id,
      caption: 'Stille vand',
      eventId,
    })
    const v1AfterEdit = await asUploader.query(api.gallery.getPhoto, {
      photoId: v1.id,
    })
    expect(v1AfterEdit).toMatchObject({
      caption: 'Stille vand',
      eventId,
      albumKey: eventId,
    })

    // Flyt flere billeder og videoer samlet fra Uden begivenhed til begivenheden.
    const moved = await asUploader.mutation(api.gallery.movePhotos, {
      photoIds: [v2.id, p1],
      eventId,
    })
    expect(moved).toEqual({ movedCount: 2, albumKey: eventId, eventId })

    const albums = await asUploader.query(api.gallery.listAlbums, {})
    expect(albums.find((a) => a.albumId === 'without-event')).toBeUndefined()
    expect(albums.find((a) => a.albumId === eventId)?.photoCount).toBe(3)

    // Ejer sletter v1: både original video og miniature fjernes fra storage.
    const v1TokenUrl = v1AfterEdit!.displayUrl!
    const v1ThumbUrl = v1AfterEdit!.thumbnailUrl!
    await asUploader.mutation(api.gallery.deletePhoto, { photoId: v1.id })

    expect(await t.run((ctx) => ctx.db.get(v1.id))).toBeNull()
    expect(await t.run((ctx) => ctx.storage.getUrl(vid1Storage))).toBeNull()
    expect(await t.run((ctx) => ctx.storage.getUrl(vid1Thumb))).toBeNull()
    expect(
      (
        await t.fetch(
          `${new URL(v1TokenUrl).pathname}${new URL(v1TokenUrl).search}`,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await t.fetch(
          `${new URL(v1ThumbUrl).pathname}${new URL(v1ThumbUrl).search}`,
        )
      ).status,
    ).toBe(404)

    // Admin sletter en andens video v2 og skriver moderationslog.
    await asAdmin.mutation(api.gallery.deletePhoto, { photoId: v2.id })
    expect(await t.run((ctx) => ctx.storage.getUrl(vid2Storage))).toBeNull()
    const log = await asAdmin.query(api.gallery.listModerationLog, {})
    expect(log).toHaveLength(1)
    expect(log[0]?.photoId).toBe(v2.id)
  })

  it('medtager videoer i dataudlevering og sletter video + miniature ved kontosletning', async () => {
    const t = setup()
    const leaving = await seedMember(t, {
      email: 'leaving@example.com',
      fullName: 'Forlader',
    })
    const staying = await seedMember(t, {
      email: 'staying@example.com',
      fullName: 'Bliver',
      isAdmin: true,
    })

    const leavingVideo = await storeFile(t, 'leaving-mp4', 'video/mp4')
    const leavingThumb = await storeFile(t, 'leaving-thumb', 'image/jpeg')
    const stayingVideo = await storeFile(t, 'staying-mp4', 'video/mp4')

    const vLeaving = await (
      await withAuthUser(t, leaving.userId)
    ).mutation(api.gallery.createVideo, {
      storageId: leavingVideo,
      thumbnailStorageId: leavingThumb,
      caption: 'Min film',
    })
    const vStaying = await (
      await withAuthUser(t, staying.userId)
    ).mutation(api.gallery.createVideo, {
      storageId: stayingVideo,
      caption: 'Andens film',
    })
    if (!vLeaving.ok || !vStaying.ok) throw new Error('expected videos')

    const exported = await (
      await withAuthUser(t, leaving.userId)
    ).query(api.account.exportData, {})
    expect(exported.photos).toHaveLength(1)
    const exportedVideo = exported.photos[0] as Record<string, unknown>
    expect(exportedVideo).toMatchObject({
      id: vLeaving.id,
      mediaKind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: 'leaving-mp4'.length,
      caption: 'Min film',
    })
    const downloadUrls = exportedVideo.downloadUrls as Record<
      string,
      string | null
    >
    expect(downloadUrls.original).toMatch(
      /^https:\/\/galleri-video-test\.convex\.site\/video\?token=[a-f0-9]+$/,
    )
    expect(downloadUrls.thumbnail).toMatch(
      /^https:\/\/galleri-video-test\.convex\.site\/photo\?token=[a-f0-9]+$/,
    )
    expect(downloadUrls.optimized).toBeNull()
    expect(JSON.stringify(exportedVideo)).not.toContain(String(leavingVideo))

    await t.run((ctx) =>
      ctx.db.patch(leaving.profileId, { deletionReservedAt: Date.now() }),
    )
    await t.mutation(internal.account.completeDeletion, {
      profileId: leaving.profileId,
    })

    const after = await t.run(async (ctx) => ({
      leavingRow: await ctx.db.get(vLeaving.id),
      leavingVideoUrl: await ctx.storage.getUrl(leavingVideo),
      leavingThumbUrl: await ctx.storage.getUrl(leavingThumb),
      stayingRow: await ctx.db.get(vStaying.id),
      stayingVideoUrl: await ctx.storage.getUrl(stayingVideo),
    }))
    expect(after.leavingRow).toBeNull()
    expect(after.leavingVideoUrl).toBeNull()
    expect(after.leavingThumbUrl).toBeNull()
    expect(after.stayingRow).not.toBeNull()
    expect(after.stayingVideoUrl).not.toBeNull()
  })
})

describe('/video token-httpAction med streaming Range uden hele filen i RAM', () => {
  it('udleverer aldrig rå storageId/getUrl, isolerer /photo og /video, og streamer Range 206/416 uden ctx.storage.get', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'stream@example.com',
      fullName: 'Streamer',
    })
    const asMember = await withAuthUser(t, member.userId)

    const videoContent = '0123456789'
    const videoStorage = await storeFile(t, videoContent, 'video/mp4')
    const thumbStorage = await storeFile(t, 'thumb-jpeg', 'image/jpeg')
    const imgStorage = await storeFile(t, 'photo-jpeg', 'image/jpeg')

    const vid = await asMember.mutation(api.gallery.createVideo, {
      storageId: videoStorage,
      thumbnailStorageId: thumbStorage,
      caption: 'Strømfilm',
    })
    if (!vid.ok) throw new Error('expected video')
    const imgId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: imgStorage,
      thumbnailStorageId: imgStorage,
    })

    const vidView = await asMember.query(api.gallery.getPhoto, {
      photoId: vid.id,
    })
    const imgView = await asMember.query(api.gallery.getPhoto, {
      photoId: imgId,
    })
    expect(vidView).not.toHaveProperty('storageId')
    expect(vidView).not.toHaveProperty('displayToken')
    expect(vidView?.displayUrl).not.toContain('convex.cloud/api/storage')
    expect(vidView?.displayUrl).not.toContain(String(videoStorage))

    const videoEndpoint = `${new URL(vidView!.displayUrl!).pathname}${new URL(vidView!.displayUrl!).search}`
    const videoThumbEndpoint = `${new URL(vidView!.thumbnailUrl!).pathname}${new URL(vidView!.thumbnailUrl!).search}`
    const imageEndpoint = `${new URL(imgView!.displayUrl!).pathname}${new URL(imgView!.displayUrl!).search}`
    const videoToken = new URL(vidView!.displayUrl!).searchParams.get('token')!
    const imageToken = new URL(imgView!.displayUrl!).searchParams.get('token')!

    // Isolation mellem /photo og /video + ugyldige tokens.
    expect((await t.fetch('/video')).status).toBe(400)
    expect((await t.fetch('/video?token=ukendt')).status).toBe(404)
    expect((await t.fetch(`/video?token=${imageToken}`)).status).toBe(404)
    expect((await t.fetch(`/photo?token=${videoToken}`)).status).toBe(404)
    const thumbResp = await t.fetch(videoThumbEndpoint)
    expect(thumbResp.status).toBe(200)
    expect(await thumbResp.text()).toBe('thumb-jpeg')

    const upstreamRequests: Array<{ url: string; range: string | null }> = []
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        const headers = new Headers(init?.headers)
        const range = headers.get('range')
        upstreamRequests.push({ url, range })

        if (range) {
          const match = /^bytes=(\d+)-(\d+)$/.exec(range)
          if (!match) {
            return new Response(null, { status: 416 })
          }
          const start = Number(match[1])
          const end = Number(match[2])
          const slice = videoContent.slice(start, end + 1)
          return new Response(slice, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${videoContent.length}`,
              'Content-Length': String(slice.length),
              'Content-Type': 'video/mp4',
            },
          })
        }

        return new Response(videoContent, {
          status: 200,
          headers: {
            'Content-Length': String(videoContent.length),
            'Content-Type': 'video/mp4',
          },
        })
      })

    // 1. Delvis Range: bytes=2-5 -> 206 og kun 4 bytes hentet fra upstream.
    const r1 = await t.fetch(videoEndpoint, {
      headers: { Range: 'bytes=2-5' },
    })
    expect(r1.status).toBe(206)
    expect(r1.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(r1.headers.get('content-length')).toBe('4')
    expect(r1.headers.get('accept-ranges')).toBe('bytes')
    expect(r1.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r1.headers.get('content-type')).toBe('video/mp4')
    expect(await r1.text()).toBe('2345')
    expect(upstreamRequests.at(-1)?.range).toBe('bytes=2-5')

    // 2. Suffix-range: bytes=-4 -> oversættes til eksplicit bytes=6-9 til upstream.
    const r2 = await t.fetch(videoEndpoint, {
      headers: { Range: 'bytes=-4' },
    })
    expect(r2.status).toBe(206)
    expect(r2.headers.get('content-range')).toBe('bytes 6-9/10')
    expect(await r2.text()).toBe('6789')
    expect(upstreamRequests.at(-1)?.range).toBe('bytes=6-9')

    // 3. Åben range: bytes=6- -> hele resten [6, 9] uden kunstig afkortning.
    const r3 = await t.fetch(videoEndpoint, {
      headers: { Range: 'bytes=6-' },
    })
    expect(r3.status).toBe(206)
    expect(r3.headers.get('content-range')).toBe('bytes 6-9/10')
    expect(await r3.text()).toBe('6789')
    expect(upstreamRequests.at(-1)?.range).toBe('bytes=6-9')

    // 4. Fuld GET uden Range -> 200.
    const full = await t.fetch(videoEndpoint)
    expect(full.status).toBe(200)
    expect(full.headers.get('content-length')).toBe('10')
    expect(await full.text()).toBe(videoContent)
    expect(upstreamRequests.at(-1)?.range).toBeNull()

    // 5. HEAD og ugyldig Range (416) kalder slet ikke upstream fetch.
    const callsBeforeHead = fetchSpy.mock.calls.length
    const headFull = await t.fetch(videoEndpoint, { method: 'HEAD' })
    expect(headFull.status).toBe(200)
    expect(headFull.headers.get('content-length')).toBe('10')
    expect(await headFull.text()).toBe('')

    const headRange = await t.fetch(videoEndpoint, {
      method: 'HEAD',
      headers: { Range: 'bytes=1-3' },
    })
    expect(headRange.status).toBe(206)
    expect(headRange.headers.get('content-range')).toBe('bytes 1-3/10')
    expect(headRange.headers.get('content-length')).toBe('3')

    const badRange = await t.fetch(videoEndpoint, {
      headers: { Range: 'bytes=50-60' },
    })
    expect(badRange.status).toBe(416)
    expect(badRange.headers.get('content-range')).toBe('bytes */10')
    expect(fetchSpy.mock.calls.length).toBe(callsBeforeHead)

    // 6. Simuleret 50 MB-video i metadata: Range bytes=40000000-40000003 henter kun 4 bytes!
    await t.run(async (ctx) => {
      await (
        ctx.db as unknown as {
          patch: (id: Id<'_storage'>, value: { size: number }) => Promise<void>
        }
      ).patch(videoStorage, { size: 50 * 1024 * 1024 })
    })
    fetchSpy.mockImplementationOnce(async (_input, init) => {
      const range = new Headers(init?.headers).get('range')
      expect(range).toBe('bytes=40000000-40000003')
      return new Response('ABCD', {
        status: 206,
        headers: {
          'Content-Range': `bytes 40000000-40000003/${50 * 1024 * 1024}`,
          'Content-Length': '4',
          'Content-Type': 'video/mp4',
        },
      })
    })
    const bigRangeResp = await t.fetch(videoEndpoint, {
      headers: { Range: 'bytes=40000000-40000003' },
    })
    expect(bigRangeResp.status).toBe(206)
    expect(bigRangeResp.headers.get('content-range')).toBe(
      `bytes 40000000-40000003/${50 * 1024 * 1024}`,
    )
    expect(await bigRangeResp.text()).toBe('ABCD')

    // 7. Upstream-fejl giver 502 uden at lække den interne storage-URL.
    fetchSpy.mockRejectedValueOnce(new Error('network boom'))
    const errResp = await t.fetch(videoEndpoint)
    expect(errResp.status).toBe(502)
    expect(await errResp.text()).not.toContain('convex.cloud/api/storage')

    // 8. Tilbagetrukket link virker ikke længere på /video.
    await asMember.mutation(api.gallery.revokePhotoLink, { photoId: vid.id })
    expect((await t.fetch(videoEndpoint)).status).toBe(404)
    expect(imageEndpoint).toContain('/photo?token=')
  })

  it('sliceReadableStream skærer som ren strøm og annullerer læsningen straks efter slutbyte', async () => {
    let chunksPulled = 0
    let canceled = false
    const encoder = new TextEncoder()
    const chunks = ['0123', '4567', '89ab', 'cdef', 'ghij', 'klmn']

    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (chunksPulled >= chunks.length) {
            controller.close()
            return
          }
          controller.enqueue(encoder.encode(chunks[chunksPulled]))
          chunksPulled += 1
        },
        cancel() {
          canceled = true
        },
      },
      { highWaterMark: 0 },
    )

    const sliced = sliceReadableStream(source, 2, 6)
    const text = await new Response(sliced).text()
    expect(text).toBe('23456')
    expect(canceled).toBe(true)
    // Kun de første 2 chunks ('0123', '4567') skal læses for at dække byte 2..6.
    expect(chunksPulled).toBe(2)
  })
})

describe('review-rettelser: observations og isStorageOwned (#366)', () => {
  it('afviser videoer i observations.add/update og udleverer aldrig getUrl i observations.list (R1)', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'obs@example.com',
      fullName: 'Observatør',
    })
    const asMember = await withAuthUser(t, member.userId)

    const videoStorage = await storeFile(t, 'vid-obs', 'video/mp4')
    const thumbStorage = await storeFile(t, 'thumb-obs', 'image/jpeg')
    const vidWithThumb = await asMember.mutation(api.gallery.createVideo, {
      storageId: videoStorage,
      thumbnailStorageId: thumbStorage,
      caption: 'Rådyr video',
    })
    const vidWithoutThumb = await asMember.mutation(api.gallery.createVideo, {
      storageId: await storeFile(t, 'vid-obs-2', 'video/webm'),
      caption: 'Video uden miniature',
    })
    const imgStorage = await storeFile(t, 'img-obs', 'image/jpeg')
    const photoId = await asMember.mutation(api.gallery.createPhoto, {
      storageId: imgStorage,
      thumbnailStorageId: await storeFile(t, 'img-obs-thumb', 'image/jpeg'),
      caption: 'Rigtigt foto',
    })
    if (!vidWithThumb.ok || !vidWithoutThumb.ok) {
      throw new Error('expected videos')
    }

    // add og update med video-id afvises.
    await expect(
      asMember.mutation(api.observations.add, {
        species: 'Rådyr',
        observedOn: '2026-11-21',
        photoId: vidWithThumb.id,
      }),
    ).rejects.toThrow('OBSERVATION_PHOTO_VIDEO_NOT_ALLOWED')

    const obsId = await asMember.mutation(api.observations.add, {
      species: 'Musvåge',
      observedOn: '2026-11-21',
      photoId,
    })

    await expect(
      asMember.mutation(api.observations.update, {
        observationId: obsId,
        photoId: vidWithThumb.id,
      }),
    ).rejects.toThrow('OBSERVATION_PHOTO_VIDEO_NOT_ALLOWED')

    // Hvis en ældre eller direkte indsat observation peger på en video, må
    // observations.list aldrig returnere ctx.storage.getUrl.
    await t.run(async (ctx) => {
      await ctx.db.insert('observations', {
        species: 'Video med thumb',
        observedOn: '2026-11-20',
        photoId: vidWithThumb.id,
        createdById: member.profileId,
        createdByName: 'Observatør',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('observations', {
        species: 'Video uden thumb',
        observedOn: '2026-11-19',
        photoId: vidWithoutThumb.id,
        createdById: member.profileId,
        createdByName: 'Observatør',
        createdAt: 1,
        updatedAt: 1,
      })
    })

    const list = await asMember.query(api.observations.list, {})
    const withThumbRow = list.find((row) => row.species === 'Video med thumb')
    const withoutThumbRow = list.find(
      (row) => row.species === 'Video uden thumb',
    )

    expect(withThumbRow?.photo?.thumbnailUrl).toMatch(
      /^https:\/\/galleri-video-test\.convex\.site\/photo\?token=[a-f0-9]+$/,
    )
    expect(withThumbRow?.photo?.displayUrl).toBe(
      withThumbRow?.photo?.thumbnailUrl,
    )
    expect(JSON.stringify(withThumbRow?.photo)).not.toContain(
      'convex.cloud/api/storage',
    )
    expect(withoutThumbRow?.photo).toBeNull()
  })

  it('beskytter avatarStorageId, badges imageStorageId/printStorageId og photos optimizedStorageId i createVideo (R3)', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'ejet@example.com',
      fullName: 'Ejer',
    })
    const asMember = await withAuthUser(t, member.userId)

    const avatarStorage = await storeFile(t, 'avatar-bytes', 'image/png')
    const badgeImgStorage = await storeFile(t, 'badge-img', 'image/png')
    const badgePrintStorage = await storeFile(t, 'badge-print', 'image/png')
    const photoOriginal = await storeFile(t, 'photo-orig', 'image/jpeg')
    const photoOptimized = await storeFile(t, 'photo-opt', 'image/jpeg')

    await t.run(async (ctx) => {
      await ctx.db.patch(member.profileId, { avatarStorageId: avatarStorage })
      await ctx.db.insert('badges', {
        slug: 'eget-badge',
        name: 'Eget Badge',
        imageStorageId: badgeImgStorage,
        imageWidth: 100,
        imageHeight: 100,
        imageMimeType: 'image/png',
        cropX: 0,
        cropY: 0,
        cropSize: 100,
        diameterMm: 44,
        bleedMm: 2,
        printStorageId: badgePrintStorage,
        printStatus: 'ready',
        printAttempts: 1,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
        awardedCount: 0,
      })
      await ctx.db.insert('photos', {
        storageId: photoOriginal,
        optimizedStorageId: photoOptimized,
        albumKey: 'without-event',
        uploaderId: member.profileId,
        createdAt: 1,
        optimizationStatus: 'ready',
        optimizationAttempts: 0,
        commentCount: 0,
      })
    })

    for (const ownedId of [
      avatarStorage,
      badgeImgStorage,
      badgePrintStorage,
      photoOptimized,
    ]) {
      // Forsøg som video-storageId
      const asStorage = await asMember.mutation(api.gallery.createVideo, {
        storageId: ownedId,
      })
      expect(asStorage).toEqual({ ok: false, error: 'VIDEO_UPLOAD_NOT_FOUND' })
      expect(await t.run((ctx) => ctx.storage.getUrl(ownedId))).not.toBeNull()

      // Forsøg som thumbnailStorageId sammen med en ny ugyldig video-storageId
      const freshBadVideo = await storeFile(t, 'bad', 'text/plain')
      const asThumb = await asMember.mutation(api.gallery.createVideo, {
        storageId: freshBadVideo,
        thumbnailStorageId: ownedId,
      })
      expect(asThumb).toEqual({ ok: false, error: 'VIDEO_THUMBNAIL_INVALID' })
      expect(await t.run((ctx) => ctx.storage.getUrl(ownedId))).not.toBeNull()
      expect(await t.run((ctx) => ctx.storage.getUrl(freshBadVideo))).toBeNull()
    }
  })
})
