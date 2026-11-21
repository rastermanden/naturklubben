/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function seedUsers(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUser = await ctx.db.insert('users', {
      email: 'admin@example.com',
    })
    const adminProfile = await ctx.db.insert('profiles', {
      userId: adminUser,
      fullName: 'Admin Medlem',
      isAdmin: true,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })

    const memberUser = await ctx.db.insert('users', {
      email: 'medlem@example.com',
    })
    const memberProfile = await ctx.db.insert('profiles', {
      userId: memberUser,
      fullName: 'Almindeligt Medlem',
      isAdmin: false,
      chatColor: '#2563eb',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 2,
    })

    const secondAdminUser = await ctx.db.insert('users', {
      email: 'admin2@example.com',
    })
    const secondAdminProfile = await ctx.db.insert('profiles', {
      userId: secondAdminUser,
      fullName: 'Anden Admin',
      isAdmin: true,
      chatColor: '#dc2626',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 3,
    })

    return {
      admin: { userId: adminUser, profileId: adminProfile },
      member: { userId: memberUser, profileId: memberProfile },
      secondAdmin: { userId: secondAdminUser, profileId: secondAdminProfile },
    }
  })
}

async function storeTyped(
  t: ReturnType<typeof convexTest>,
  blob: Blob,
  contentType: string,
) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(blob)
    await ctx.db.patch(storageId, { contentType })
    return storageId
  })
}

describe('badges.generateImageUploadUrl', () => {
  it('afviser anonyme og ikke-admins og giver URL til admins', async () => {
    const t = convexTest(schema, modules)
    const users = await seedUsers(t)

    await expect(
      t.mutation(api.badges.generateImageUploadUrl, {}),
    ).rejects.toThrow('NOT_A_MEMBER')

    await expect(
      t
        .withIdentity({ subject: users.member.userId })
        .mutation(api.badges.generateImageUploadUrl, {}),
    ).rejects.toThrow('NOT_ADMIN')

    const result = await t
      .withIdentity({ subject: users.admin.userId })
      .mutation(api.badges.generateImageUploadUrl, {})
    expect(typeof result.uploadUrl).toBe('string')
    expect(result.uploadUrl.length).toBeGreaterThan(0)
  })
})

describe('badges.createBadge og updateBadge', () => {
  it('kræver admin og opretter/opdaterer med billedvalidering og oprydning', async () => {
    const t = convexTest(schema, modules)
    const users = await seedUsers(t)
    const validImage = await storeTyped(
      t,
      new Blob(['png'], { type: 'image/png' }),
      'image/png',
    )

    await expect(
      t
        .withIdentity({ subject: users.member.userId })
        .mutation(api.badges.createBadge, {
          slug: 'skovmaerke',
          name: 'Skovmærke',
          description: 'Til ture i skoven.',
          imageStorageId: validImage,
          imageWidth: 1200,
          imageHeight: 1200,
          imageMimeType: 'image/png',
          cropX: 0,
          cropY: 0,
          cropSize: 1200,
          diameterMm: 58,
          bleedMm: 5,
        }),
    ).rejects.toThrow('NOT_ADMIN')

    const badMime = await storeTyped(
      t,
      new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      'image/svg+xml',
    )
    await expect(
      t
        .withIdentity({ subject: users.admin.userId })
        .mutation(api.badges.createBadge, {
          slug: 'skovmaerke',
          name: 'Skovmærke',
          imageStorageId: badMime,
          imageWidth: 1200,
          imageHeight: 1200,
          imageMimeType: 'image/png',
          cropX: 0,
          cropY: 0,
          cropSize: 1200,
          diameterMm: 58,
          bleedMm: 5,
        }),
    ).rejects.toThrow('BADGE_IMAGE_TYPE_INVALID')

    const tooLarge = await storeTyped(
      t,
      new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }),
      'image/png',
    )
    await expect(
      t
        .withIdentity({ subject: users.admin.userId })
        .mutation(api.badges.createBadge, {
          slug: 'skovmaerke',
          name: 'Skovmærke',
          imageStorageId: tooLarge,
          imageWidth: 1200,
          imageHeight: 1200,
          imageMimeType: 'image/png',
          cropX: 0,
          cropY: 0,
          cropSize: 1200,
          diameterMm: 58,
          bleedMm: 5,
        }),
    ).rejects.toThrow('BADGE_IMAGE_TOO_LARGE')

    const asAdmin = t.withIdentity({ subject: users.admin.userId })
    const badgeId = await asAdmin.mutation(api.badges.createBadge, {
      slug: 'skovmaerke',
      name: 'Skovmærke',
      description: 'Til ture i skoven.',
      imageStorageId: validImage,
      imageWidth: 1200,
      imageHeight: 1200,
      imageMimeType: 'image/png',
      cropX: 0,
      cropY: 0,
      cropSize: 1200,
      diameterMm: 58,
      bleedMm: 5,
      isActive: false,
    })

    const created = await t.run(async (ctx) => ctx.db.get(badgeId))
    expect(created).toMatchObject({
      slug: 'skovmaerke',
      name: 'Skovmærke',
      isActive: false,
      printStatus: 'pending',
    })

    // Lav en trykfil, og verificér at toggle af isActive bevarer den.
    const claimed = await asAdmin.mutation(api.badges.startPrintRender, {
      badgeId,
    })
    expect(claimed.status).toBe('claimed')
    if (claimed.status !== 'claimed') throw new Error('Forventede claimed')
    const printFile = await storeTyped(
      t,
      new Blob(['print'], { type: 'image/png' }),
      'image/png',
    )
    const finished = await asAdmin.mutation(api.badges.finishPrintRender, {
      badgeId,
      expectedAttempt: claimed.attempt,
      succeeded: true,
      printStorageId: printFile,
    })
    expect(finished.status).toBe('ready')

    await asAdmin.mutation(api.badges.updateBadge, {
      badgeId,
      isActive: true,
    })
    const afterToggle = await t.run(async (ctx) => ({
      badge: await ctx.db.get(badgeId),
      printUrl: await ctx.storage.getUrl(printFile),
    }))
    expect(afterToggle.badge?.isActive).toBe(true)
    expect(afterToggle.badge?.printStatus).toBe('ready')
    expect(afterToggle.printUrl).not.toBeNull()

    // Udskiftning af billede nulstiller trykfil og sletter både gammelt billede og gammel trykfil.
    const nextImage = await storeTyped(
      t,
      new Blob(['webp'], { type: 'image/webp' }),
      'image/webp',
    )
    await asAdmin.mutation(api.badges.updateBadge, {
      badgeId,
      imageStorageId: nextImage,
      imageWidth: 1500,
      imageHeight: 1500,
      imageMimeType: 'image/webp',
      cropX: 100,
      cropY: 100,
      cropSize: 1000,
    })

    const afterReplace = await t.run(async (ctx) => ({
      badge: await ctx.db.get(badgeId),
      oldImageUrl: await ctx.storage.getUrl(validImage),
      oldPrintUrl: await ctx.storage.getUrl(printFile),
      newImageUrl: await ctx.storage.getUrl(nextImage),
    }))
    expect(afterReplace.badge?.printStatus).toBe('pending')
    expect(afterReplace.badge?.printStorageId).toBeUndefined()
    expect(afterReplace.badge?.printStartedAt).toBeUndefined()
    expect(afterReplace.oldImageUrl).toBeNull()
    expect(afterReplace.oldPrintUrl).toBeNull()
    expect(afterReplace.newImageUrl).not.toBeNull()
  })
})

describe('badges.startPrintRender og finishPrintRender', () => {
  it('håndhæver admin-adgang, aktiv/forældet lås, PNG-type og superseded oprydning', async () => {
    const t = convexTest(schema, modules)
    const users = await seedUsers(t)
    const image = await storeTyped(
      t,
      new Blob(['png'], { type: 'image/png' }),
      'image/png',
    )

    const asAdmin = t.withIdentity({ subject: users.admin.userId })
    const badgeId = await asAdmin.mutation(api.badges.createBadge, {
      slug: 'testmaerke',
      name: 'Testmærke',
      imageStorageId: image,
      imageWidth: 1000,
      imageHeight: 1000,
      imageMimeType: 'image/png',
      cropX: 0,
      cropY: 0,
      cropSize: 1000,
      diameterMm: 58,
      bleedMm: 5,
    })

    await expect(
      t
        .withIdentity({ subject: users.member.userId })
        .mutation(api.badges.startPrintRender, { badgeId }),
    ).rejects.toThrow('NOT_ADMIN')

    const firstClaim = await asAdmin.mutation(api.badges.startPrintRender, {
      badgeId,
    })
    expect(firstClaim.status).toBe('claimed')
    if (firstClaim.status !== 'claimed') throw new Error('Forventede claimed')

    // Aktiv rendering returnerer rendering uden nyt attempt.
    const busyClaim = await asAdmin.mutation(api.badges.startPrintRender, {
      badgeId,
    })
    expect(busyClaim).toEqual({ status: 'rendering', printUrl: null })

    // Ældre end 2 minutter giver lov til at overhale.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 2 * 60 * 1000 + 1)
      const takeover = await asAdmin.mutation(api.badges.startPrintRender, {
        badgeId,
      })
      expect(takeover.status).toBe('claimed')
      if (takeover.status !== 'claimed') throw new Error('Forventede takeover')
      expect(takeover.attempt).toBe(2)

      // Det gamle forsøg overhales og rydder sin fil op.
      const stalePrint = await storeTyped(
        t,
        new Blob(['stale'], { type: 'image/png' }),
        'image/png',
      )
      const superseded = await asAdmin.mutation(api.badges.finishPrintRender, {
        badgeId,
        expectedAttempt: firstClaim.attempt,
        succeeded: true,
        printStorageId: stalePrint,
      })
      expect(superseded).toEqual({ status: 'superseded', printUrl: null })
      const staleUrl = await t.run(async (ctx) =>
        ctx.storage.getUrl(stalePrint),
      )
      expect(staleUrl).toBeNull()

      // Forkert filtype afvises, slettes og markerer badgen som failed.
      const jpegPrint = await storeTyped(
        t,
        new Blob(['jpg'], { type: 'image/jpeg' }),
        'image/jpeg',
      )
      const wrongType = await asAdmin.mutation(api.badges.finishPrintRender, {
        badgeId,
        expectedAttempt: takeover.attempt,
        succeeded: true,
        printStorageId: jpegPrint,
      })
      expect(wrongType).toEqual({
        status: 'failed',
        error: 'Trykfilen skal være en PNG-fil.',
        printUrl: null,
      })
      const badPrintUrl = await t.run(async (ctx) =>
        ctx.storage.getUrl(jpegPrint),
      )
      expect(badPrintUrl).toBeNull()
      const failedBadge = await t.run(async (ctx) => ctx.db.get(badgeId))
      expect(failedBadge?.printStatus).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('gemmer fejl og sætter status failed når originalbilledet mangler', async () => {
    const t = convexTest(schema, modules)
    const users = await seedUsers(t)
    const image = await storeTyped(
      t,
      new Blob(['png'], { type: 'image/png' }),
      'image/png',
    )
    const asAdmin = t.withIdentity({ subject: users.admin.userId })
    const badgeId = await asAdmin.mutation(api.badges.createBadge, {
      slug: 'manglende-fil',
      name: 'Manglende fil',
      imageStorageId: image,
      imageWidth: 1000,
      imageHeight: 1000,
      imageMimeType: 'image/png',
      cropX: 0,
      cropY: 0,
      cropSize: 1000,
      diameterMm: 58,
      bleedMm: 5,
    })

    await t.run(async (ctx) => {
      await ctx.storage.delete(image)
    })

    const result = await asAdmin.mutation(api.badges.startPrintRender, {
      badgeId,
    })
    expect(result).toEqual({
      status: 'failed',
      error:
        'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
      printUrl: null,
    })
    const badge = await t.run(async (ctx) => ctx.db.get(badgeId))
    expect(badge?.printStatus).toBe('failed')
    expect(badge?.printError).toBe(
      'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
    )
  })
})

describe('badges.nominate og allMemberBadges', () => {
  it('tillader indstilling af et andet medlem, afviser sig selv, og beriger tildelte badges', async () => {
    const t = convexTest(schema, modules)
    const users = await seedUsers(t)
    const image = await storeTyped(
      t,
      new Blob(['png'], { type: 'image/png' }),
      'image/png',
    )

    await expect(t.query(api.badges.allMemberBadges, {})).rejects.toThrow(
      'NOT_A_MEMBER',
    )

    const asAdmin = t.withIdentity({ subject: users.admin.userId })
    const badgeId = await asAdmin.mutation(api.badges.createBadge, {
      slug: 'turmaerke',
      name: 'Turmærke',
      description: 'For en ekstra god tur.',
      imageStorageId: image,
      imageWidth: 1600,
      imageHeight: 1200,
      imageMimeType: 'image/png',
      cropX: 200,
      cropY: 0,
      cropSize: 1200,
      diameterMm: 58,
      bleedMm: 5,
    })

    const asMember = t.withIdentity({ subject: users.member.userId })
    await expect(
      asMember.mutation(api.badges.nominate, {
        badgeId,
        nomineeId: users.member.profileId,
        reason: 'Jeg vil gerne selv have den.',
      }),
    ).rejects.toThrow('BADGE_SELF_NOMINATION')

    const nominationId = await asMember.mutation(api.badges.nominate, {
      badgeId,
      nomineeId: users.admin.profileId,
      reason: 'Stod for bålet i øsende regn.',
    })

    await asAdmin.mutation(api.badges.vote, {
      nominationId,
      vote: 'approve',
    })
    await t
      .withIdentity({ subject: users.secondAdmin.userId })
      .mutation(api.badges.vote, {
        nominationId,
        vote: 'approve',
      })

    const awarded = await asMember.query(api.badges.allMemberBadges, {})
    expect(awarded).toHaveLength(1)
    expect(awarded[0]).toMatchObject({
      badgeId,
      badgeName: 'Turmærke',
      badgeSlug: 'turmaerke',
      badgeDescription: 'For en ekstra god tur.',
      profileId: users.admin.profileId,
      nominatedByName: 'Almindeligt Medlem',
      reason: 'Stod for bålet i øsende regn.',
      imageWidth: 1600,
      imageHeight: 1200,
      cropX: 200,
      cropY: 0,
      cropSize: 1200,
    })
    expect(awarded[0]?.imageUrl).toBeTruthy()
  })
})
