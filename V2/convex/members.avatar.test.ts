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
    const userId = await ctx.db.insert('users', { email: 'medlem@example.com' })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: 'Test Medlem',
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

/**
 * `storage.store` i convex-test skriver ikke `contentType`. Et rigtigt upload
 * gør, så testen sætter feltet bagefter.
 */
async function storeTyped(
  t: TestConvexInstance,
  blob: Blob,
  contentType: string,
) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(blob)
    await ctx.db.patch(storageId as never, { contentType } as never)
    return storageId
  })
}

describe('saveAvatar', () => {
  it('afviser en fil, der ikke er et billede, og sletter den', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const storageId = await storeTyped(
      t,
      new Blob(['tekst'], { type: 'text/plain' }),
      'text/plain',
    )

    const result = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.members.saveAvatar, { storageId })

    expect(result).toEqual({ error: 'AVATAR_NOT_AN_IMAGE' })
    const url = await t.run(async (ctx) => await ctx.storage.getUrl(storageId))
    expect(url).toBeNull()
  })

  it('gemmer billedet og sletter det forrige', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const first = await storeTyped(
      t,
      new Blob(['et'], { type: 'image/jpeg' }),
      'image/jpeg',
    )
    const second = await storeTyped(
      t,
      new Blob(['to'], { type: 'image/jpeg' }),
      'image/jpeg',
    )
    const ids = { first, second }

    const asMember = await withAuthUser(t, member.userId)
    await asMember.mutation(api.members.saveAvatar, { storageId: ids.first })
    await asMember.mutation(api.members.saveAvatar, { storageId: ids.second })

    const after = await t.run(async (ctx) => {
      const profile = await ctx.db.get(member.profileId)
      return {
        profile,
        first: await ctx.storage.getUrl(ids.first),
        second: await ctx.storage.getUrl(ids.second),
      }
    })
    expect(after.profile?.avatarStorageId).toBe(ids.second)
    expect(after.profile?.avatarUrl).toBe(after.second)
    expect(after.first).toBeNull()
    expect(after.second).not.toBeNull()
  })

  it('sletter et billede, der er større end 5 MB', async () => {
    const t = createTestConvex()
    const member = await seedMember(t)
    const storageId = await storeTyped(
      t,
      new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }),
      'image/png',
    )

    const result = await (
      await withAuthUser(t, member.userId)
    ).mutation(api.members.saveAvatar, { storageId })

    expect(result).toEqual({ error: 'AVATAR_TOO_LARGE' })
    const url = await t.run(async (ctx) => await ctx.storage.getUrl(storageId))
    expect(url).toBeNull()
  })
})
