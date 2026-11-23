// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestConvex, withAuthUser } from '../test/convexTestAuth'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_AUDIO_BYTES, parseByteRange } from './audio'

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

/**
 * `storage.store` i convex-test sætter ikke `contentType` på `_storage`-rækken.
 * Et rigtigt upload gør, så testen sætter feltet bagefter.
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

const SITE_URL = 'https://lyd-test.convex.site'
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
  const env = envMap()
  if (previousSiteUrl === undefined) {
    delete env.CONVEX_SITE_URL
  } else {
    env.CONVEX_SITE_URL = previousSiteUrl
  }
})

describe('parseByteRange', () => {
  it('parser gyldige og ugyldige byteintervaller', () => {
    expect(parseByteRange(null, 10)).toEqual({ kind: 'none' })
    expect(parseByteRange('bytes=0-3', 10)).toEqual({
      kind: 'range',
      start: 0,
      end: 3,
    })
    expect(parseByteRange('bytes=6-', 10)).toEqual({
      kind: 'range',
      start: 6,
      end: 9,
    })
    expect(parseByteRange('bytes=-4', 10)).toEqual({
      kind: 'range',
      start: 6,
      end: 9,
    })
    expect(parseByteRange('bytes=4-999', 10)).toEqual({
      kind: 'range',
      start: 4,
      end: 9,
    })
    expect(parseByteRange('bytes=10-12', 10)).toEqual({ kind: 'invalid' })
    expect(parseByteRange('bytes=5-2', 10)).toEqual({ kind: 'invalid' })
    expect(parseByteRange('bytes=0-1, 2-3', 10)).toEqual({ kind: 'invalid' })
    expect(parseByteRange('items=0-1', 10)).toEqual({ kind: 'invalid' })
    expect(parseByteRange('bytes=0-0', 0)).toEqual({ kind: 'invalid' })
  })
})

describe('audio autorisation og roller', () => {
  it('afviser uautentificerede og brugere uden medlemsprofil', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'medlem@example.com',
      fullName: 'Medlem',
    })
    const nonMemberUserId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'gaest@example.com' }),
    )
    const storageId = await storeFile(t, 'ID3mp3data', 'audio/mpeg')
    const created = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.audio.createClip, { storageId, title: 'Fuglesang' })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('expected clip')

    // Gæst uden session afvises på alle offentlige endpoints.
    await expect(t.query(api.audio.list, {})).rejects.toThrow('NOT_A_MEMBER')
    await expect(t.mutation(api.audio.generateUploadUrl, {})).rejects.toThrow(
      'NOT_A_MEMBER',
    )
    await expect(
      t.mutation(api.audio.createClip, { storageId, title: 'Snig' }),
    ).rejects.toThrow('NOT_A_MEMBER')
    await expect(
      t.mutation(api.audio.deleteClip, { clipId: created.id }),
    ).rejects.toThrow('NOT_A_MEMBER')

    // Indlogget bruger uden profil er ikke medlem og afvises også.
    const asNonMember = await withAuthUser(t, nonMemberUserId)
    await expect(asNonMember.query(api.audio.list, {})).rejects.toThrow(
      'NOT_A_MEMBER',
    )
    await expect(
      asNonMember.mutation(api.audio.generateUploadUrl, {}),
    ).rejects.toThrow('NOT_A_MEMBER')
  })

  it('spærrer skrivninger for en profil med aktiv sletningsreservation', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'slettes@example.com',
      fullName: 'Slettes Snart',
      deletionReservedAt: Date.now(),
    })
    const storageId = await storeFile(t, 'ID3mp3', 'audio/mpeg')
    const asDeleting = await withAuthUser(t, member.userId)

    await expect(
      asDeleting.mutation(api.audio.generateUploadUrl, {}),
    ).rejects.toThrow('ACCOUNT_DELETION_RESERVED')
    await expect(
      asDeleting.mutation(api.audio.createClip, {
        storageId,
        title: 'Blokeret',
      }),
    ).rejects.toThrow('ACCOUNT_DELETION_RESERVED')
  })
})

describe('audio upload-validering på serveren', () => {
  it('accepterer både audio/mpeg og audio/mp3 og afviser ikke-mp3 med sletning af filen', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'lyd@example.com',
      fullName: 'Lyd Medlem',
    })
    const asMember = await withAuthUser(t, member.userId)

    const mpegId = await storeFile(t, 'mpeg-bytes', 'audio/mpeg')
    const mp3Id = await storeFile(t, 'mp3-bytes', 'audio/mp3')

    const res1 = await asMember.mutation(api.audio.createClip, {
      storageId: mpegId,
      title: 'Morgensang',
    })
    const res2 = await asMember.mutation(api.audio.createClip, {
      storageId: mp3Id,
      title: 'Skovbæk',
    })
    expect(res1.ok).toBe(true)
    expect(res2.ok).toBe(true)

    for (const badMime of ['audio/wav', 'audio/ogg', 'image/jpeg', undefined]) {
      const badStorageId = await storeFile(t, 'ikke-mp3', badMime)
      const rejected = await asMember.mutation(api.audio.createClip, {
        storageId: badStorageId,
        title: 'Forkert type',
      })
      expect(rejected).toEqual({ ok: false, error: 'AUDIO_NOT_MP3' })

      const urlAfter = await t.run((ctx) => ctx.storage.getUrl(badStorageId))
      expect(urlAfter).toBeNull()
    }

    const clips = await asMember.query(api.audio.list, {})
    expect(clips).toHaveLength(2)
  })

  it('afviser filer over 15 MB og tomme filer og sletter dem fra fillageret', async () => {
    const t = setup()
    const member = await seedMember(t, {
      email: 'stor@example.com',
      fullName: 'Stor Fil',
    })
    const asMember = await withAuthUser(t, member.userId)

    const tooLargeId = await storeFile(
      t,
      new Uint8Array(MAX_AUDIO_BYTES + 1),
      'audio/mpeg',
    )
    const tooLargeResult = await asMember.mutation(api.audio.createClip, {
      storageId: tooLargeId,
      title: 'Alt for stor',
    })
    expect(tooLargeResult).toEqual({ ok: false, error: 'AUDIO_TOO_LARGE' })
    expect(await t.run((ctx) => ctx.storage.getUrl(tooLargeId))).toBeNull()

    const exactLimitId = await storeFile(
      t,
      new Uint8Array(MAX_AUDIO_BYTES),
      'audio/mpeg',
    )
    const exactLimitResult = await asMember.mutation(api.audio.createClip, {
      storageId: exactLimitId,
      title: 'Præcis 15 MB',
    })
    expect(exactLimitResult.ok).toBe(true)

    const emptyId = await storeFile(t, new Uint8Array(0), 'audio/mpeg')
    const emptyResult = await asMember.mutation(api.audio.createClip, {
      storageId: emptyId,
      title: 'Tom',
    })
    expect(emptyResult).toEqual({ ok: false, error: 'AUDIO_EMPTY' })
    expect(await t.run((ctx) => ctx.storage.getUrl(emptyId))).toBeNull()
  })

  it('afviser tom eller for lang titel og beskytter andres storageId mod sletning', async () => {
    const t = setup()
    const owner = await seedMember(t, {
      email: 'ejer@example.com',
      fullName: 'Ejer',
    })
    const other = await seedMember(t, {
      email: 'anden@example.com',
      fullName: 'Anden',
    })
    const asOwner = await withAuthUser(t, owner.userId)
    const asOther = await withAuthUser(t, other.userId)

    const blankTitleStorage = await storeFile(t, 'mp3', 'audio/mpeg')
    expect(
      await asOwner.mutation(api.audio.createClip, {
        storageId: blankTitleStorage,
        title: '   ',
      }),
    ).toEqual({ ok: false, error: 'AUDIO_TITLE_REQUIRED' })
    expect(
      await t.run((ctx) => ctx.storage.getUrl(blankTitleStorage)),
    ).toBeNull()

    const longTitleStorage = await storeFile(t, 'mp3', 'audio/mpeg')
    expect(
      await asOwner.mutation(api.audio.createClip, {
        storageId: longTitleStorage,
        title: 'a'.repeat(121),
      }),
    ).toEqual({ ok: false, error: 'AUDIO_TITLE_TOO_LONG' })
    expect(
      await t.run((ctx) => ctx.storage.getUrl(longTitleStorage)),
    ).toBeNull()

    // Gyldig fil ejet af owner må ikke kunne slettes af en anden via createClip.
    const ownedStorage = await storeFile(t, 'owner-mp3', 'audio/mpeg')
    const created = await asOwner.mutation(api.audio.createClip, {
      storageId: ownedStorage,
      title: 'Ejers klip',
    })
    expect(created.ok).toBe(true)

    const hijackAttempt = await asOther.mutation(api.audio.createClip, {
      storageId: ownedStorage,
      title: '   ',
    })
    expect(hijackAttempt).toEqual({
      ok: false,
      error: 'AUDIO_UPLOAD_NOT_FOUND',
    })
    expect(
      await t.run((ctx) => ctx.storage.getUrl(ownedStorage)),
    ).not.toBeNull()
  })
})

describe('audio liste, token-afspilning og sletning', () => {
  it('lister nyeste først uden storageId/getUrl og afspiller gennem token-httpAction med Range', async () => {
    const t = setup()
    const uploader = await seedMember(t, {
      email: 'uploader@example.com',
      fullName: 'Signe',
    })
    const other = await seedMember(t, {
      email: 'other@example.com',
      fullName: 'Bo',
    })
    const admin = await seedMember(t, {
      email: 'admin@example.com',
      fullName: 'Admin',
      isAdmin: true,
    })

    const asUploader = await withAuthUser(t, uploader.userId)
    const s1 = await storeFile(t, '0123456789', 'audio/mp3')
    const c1 = await asUploader.mutation(api.audio.createClip, {
      storageId: s1,
      title: 'Ældst',
    })
    expect(c1.ok).toBe(true)
    if (!c1.ok) throw new Error('expected c1')

    const s2 = await storeFile(t, 'nyeste-lyd', 'audio/mpeg')
    const c2 = await asUploader.mutation(api.audio.createClip, {
      storageId: s2,
      title: 'Nyest',
    })
    expect(c2.ok).toBe(true)
    if (!c2.ok) throw new Error('expected c2')

    await t.run(async (ctx) => {
      await ctx.db.patch(c1.id, { createdAt: 1000 })
      await ctx.db.patch(c2.id, { createdAt: 2000 })
    })

    const listAsUploader = await asUploader.query(api.audio.list, {})
    const listAsOther = await (
      await withAuthUser(t, other.userId)
    ).query(api.audio.list, {})
    const listAsAdmin = await (
      await withAuthUser(t, admin.userId)
    ).query(api.audio.list, {})

    expect(listAsUploader.map((c) => c.title)).toEqual(['Nyest', 'Ældst'])
    expect(listAsUploader[0]).toMatchObject({
      title: 'Nyest',
      uploaderName: 'Signe',
      canDelete: true,
    })
    expect(listAsOther[0]?.canDelete).toBe(false)
    expect(listAsAdmin[0]?.canDelete).toBe(true)

    // Ingen rå storageId, playToken eller permanent Convex storage-URL i svaret.
    for (const item of listAsUploader) {
      expect(item).not.toHaveProperty('storageId')
      expect(item).not.toHaveProperty('playToken')
      expect(item.audioUrl).toMatch(
        /^https:\/\/lyd-test\.convex\.site\/audio\?token=[a-f0-9]+$/,
      )
      expect(item.audioUrl).not.toContain('convex.cloud/api/storage')
      expect(item.audioUrl).not.toContain(String(s1))
      expect(item.audioUrl).not.toContain(String(s2))
    }

    const oldestPath = new URL(listAsUploader[1]!.audioUrl!).pathname
    const oldestSearch = new URL(listAsUploader[1]!.audioUrl!).search
    const oldestEndpoint = `${oldestPath}${oldestSearch}`

    // Manglende og ugyldigt token afvises.
    expect((await t.fetch('/audio')).status).toBe(400)
    expect((await t.fetch('/audio?token=ukendt')).status).toBe(404)

    // Fuld GET returnerer 200, audio/mpeg og Accept-Ranges.
    const fullResp = await t.fetch(oldestEndpoint)
    expect(fullResp.status).toBe(200)
    expect(fullResp.headers.get('content-type')).toBe('audio/mpeg')
    expect(fullResp.headers.get('accept-ranges')).toBe('bytes')
    expect(fullResp.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await fullResp.text()).toBe('0123456789')

    // Range-forespørgsel returnerer 206 Partial Content (nødvendigt på mobil/iOS).
    const rangeResp = await t.fetch(oldestEndpoint, {
      headers: { Range: 'bytes=2-5' },
    })
    expect(rangeResp.status).toBe(206)
    expect(rangeResp.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(rangeResp.headers.get('content-length')).toBe('4')
    expect(await rangeResp.text()).toBe('2345')

    // Ugyldig Range returnerer 416.
    const badRangeResp = await t.fetch(oldestEndpoint, {
      headers: { Range: 'bytes=50-60' },
    })
    expect(badRangeResp.status).toBe(416)
    expect(badRangeResp.headers.get('content-range')).toBe('bytes */10')
  })

  it('lader ejer og admin slette og fjerner filen fra storage og token-endpoint', async () => {
    const t = setup()
    const owner = await seedMember(t, {
      email: 'owner@example.com',
      fullName: 'Ejer',
    })
    const other = await seedMember(t, {
      email: 'other@example.com',
      fullName: 'Andet Medlem',
    })
    const admin = await seedMember(t, {
      email: 'admin@example.com',
      fullName: 'Admin',
      isAdmin: true,
    })

    const asOwner = await withAuthUser(t, owner.userId)
    const s1 = await storeFile(t, 'klip-1', 'audio/mpeg')
    const s2 = await storeFile(t, 'klip-2', 'audio/mpeg')
    const c1 = await asOwner.mutation(api.audio.createClip, {
      storageId: s1,
      title: 'Klip 1',
    })
    const c2 = await asOwner.mutation(api.audio.createClip, {
      storageId: s2,
      title: 'Klip 2',
    })
    if (!c1.ok || !c2.ok) throw new Error('expected clips')

    const clipsBefore = await asOwner.query(api.audio.list, {})
    const clip1Url = clipsBefore.find((c) => c.id === c1.id)?.audioUrl
    expect(clip1Url).toBeTruthy()
    const clip1Endpoint = `${new URL(clip1Url!).pathname}${new URL(clip1Url!).search}`

    // Et andet almindeligt medlem må ikke slette.
    await expect(
      (await withAuthUser(t, other.userId)).mutation(api.audio.deleteClip, {
        clipId: c1.id,
      }),
    ).rejects.toThrow('AUDIO_DELETE_NOT_AUTHORIZED')
    expect(await t.run((ctx) => ctx.storage.getUrl(s1))).not.toBeNull()

    // Ejeren kan slette sit eget klip: række, storage og token-URL forsvinder.
    await asOwner.mutation(api.audio.deleteClip, { clipId: c1.id })
    expect(await t.run((ctx) => ctx.db.get(c1.id))).toBeNull()
    expect(await t.run((ctx) => ctx.storage.getUrl(s1))).toBeNull()
    expect((await t.fetch(clip1Endpoint)).status).toBe(404)

    // En admin kan slette en andens klip: række og storage forsvinder.
    await (
      await withAuthUser(t, admin.userId)
    ).mutation(api.audio.deleteClip, { clipId: c2.id })
    expect(await t.run((ctx) => ctx.db.get(c2.id))).toBeNull()
    expect(await t.run((ctx) => ctx.storage.getUrl(s2))).toBeNull()
  })

  it('sletter medlemmets lydfiler og storage ved kontosletning uden at røre andres', async () => {
    const t = setup()
    const leaving = await seedMember(t, {
      email: 'leaving@example.com',
      fullName: 'Forlader Klubben',
    })
    const staying = await seedMember(t, {
      email: 'staying@example.com',
      fullName: 'Bliver',
      isAdmin: true,
    })

    const leavingStorage = await storeFile(t, 'farvel-lyd', 'audio/mpeg')
    const stayingStorage = await storeFile(t, 'bliver-lyd', 'audio/mpeg')

    const leavingClip = await (
      await withAuthUser(t, leaving.userId)
    ).mutation(api.audio.createClip, {
      storageId: leavingStorage,
      title: 'Farvel',
    })
    const stayingClip = await (
      await withAuthUser(t, staying.userId)
    ).mutation(api.audio.createClip, {
      storageId: stayingStorage,
      title: 'Bliver',
    })
    if (!leavingClip.ok || !stayingClip.ok) throw new Error('expected clips')

    await t.run((ctx) =>
      ctx.db.patch(leaving.profileId, { deletionReservedAt: Date.now() }),
    )
    await t.mutation(internal.account.completeDeletion, {
      profileId: leaving.profileId,
    })

    const after = await t.run(async (ctx) => ({
      leavingRow: await ctx.db.get(leavingClip.id),
      leavingFile: await ctx.storage.getUrl(leavingStorage),
      stayingRow: await ctx.db.get(stayingClip.id),
      stayingFile: await ctx.storage.getUrl(stayingStorage),
    }))
    expect(after.leavingRow).toBeNull()
    expect(after.leavingFile).toBeNull()
    expect(after.stayingRow).not.toBeNull()
    expect(after.stayingFile).not.toBeNull()
  })
})
