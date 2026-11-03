/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from './schema'
import {
  CLUB_ACTIVITIES,
  PREVIEW_CHAT_TEXT,
  PREVIEW_KABALE_SCORE,
  PREVIEW_OBSERVATION_SPECIES,
  PREVIEW_PHOTO_CAPTION,
  PREVIEW_AGENTMAIL_ADDRESS,
  PREVIEW_EVENT_TITLE,
  PREVIEW_GUEST_ALLOWLIST,
  PREVIEW_MARTIN_EMAIL,
  PREVIEW_MEMBER_NAME,
  removePasswordSignup,
  PROD_DEPLOYMENT_SLUG,
  assertPreviewSeedAllowed,
  acceptSharedPreviewPassword,
  isExistingAccountError,
  normalizePreviewEmail,
  normalizePreviewPassword,
  safePreviewSeedError,
  upsertSharedMemberProfile,
  writePreviewSample,
} from './previewSeed'

const modules = import.meta.glob('./**/*.ts')

describe('assertPreviewSeedAllowed', () => {
  it('nægter, når preview-flaget ikke er sat', () => {
    expect(() =>
      assertPreviewSeedAllowed({
        previewSeed: undefined,
        cloudUrl: 'https://savory-possum-345.convex.cloud',
      }),
    ).toThrow('PREVIEW_SEED_DISABLED')
  })

  it('nægter produktions-deploymentet, også med flaget sat', () => {
    expect(() =>
      assertPreviewSeedAllowed({
        previewSeed: '1',
        cloudUrl: `https://${PROD_DEPLOYMENT_SLUG}.convex.cloud`,
      }),
    ).toThrow('PREVIEW_SEED_REFUSED_PROD')
  })

  it('nægter, når deploymentets URL mangler', () => {
    expect(() =>
      assertPreviewSeedAllowed({ previewSeed: '1', cloudUrl: undefined }),
    ).toThrow('PREVIEW_SEED_REFUSED_PROD')
  })

  it('tillader et andet deployment med flaget sat', () => {
    expect(() =>
      assertPreviewSeedAllowed({
        previewSeed: '1',
        cloudUrl: 'https://savory-possum-345.convex.cloud',
      }),
    ).not.toThrow()
  })
})

describe('preview-legitimationsoplysninger', () => {
  it('sammenligner e-mail og adgangskode uden linjeskift fra secretet', () => {
    expect(normalizePreviewEmail(' Preview@Example.com\r\n')).toBe(
      'preview@example.com',
    )
    expect(normalizePreviewPassword('hemmelig\r\n')).toBe('hemmelig')
    expect(normalizePreviewPassword('hemmelig')).toBe('hemmelig')
  })

  it('springer en manglende eller for kort fælles adgangskode over', () => {
    expect(acceptSharedPreviewPassword(undefined)).toBeNull()
    expect(acceptSharedPreviewPassword('')).toBeNull()
    expect(acceptSharedPreviewPassword('kort')).toBeNull()
    expect(acceptSharedPreviewPassword('12345\n')).toBeNull()
    expect(acceptSharedPreviewPassword('123456\r\n')).toBe('123456')
  })

  it('videresender ikke adgangskoden fra en fejl', () => {
    const secret = 'delt-hemmelighed-9'
    const error = new Error(
      `Account someone@example.com already exists ${secret}`,
    )
    expect(isExistingAccountError(error)).toBe(true)
    expect(isExistingAccountError(new Error('PREVIEW_SEED_FAILED'))).toBe(false)
    const wrapped = safePreviewSeedError(error)
    expect(wrapped.message).toBe('PREVIEW_SEED_FAILED')
    expect(wrapped.message).not.toContain(secret)
    expect(wrapped.message).not.toContain('someone@example.com')
  })

  it('giver Grok Bot admin og lader test-adressen være medlem', () => {
    const byEmail = Object.fromEntries(
      PREVIEW_GUEST_ALLOWLIST.map((guest) => [guest.email, guest]),
    )
    expect(byEmail[PREVIEW_MARTIN_EMAIL]).toMatchObject({
      isAdmin: true,
      name: 'Martin',
    })
    expect(byEmail['kaspermoller@gmail.com']).toMatchObject({
      isAdmin: true,
      name: 'Kasper',
    })
    expect(byEmail['kaspermoller+test@gmail.com']).toMatchObject({
      isAdmin: false,
      name: 'Kasper (test)',
    })
    expect(byEmail[PREVIEW_AGENTMAIL_ADDRESS]).toMatchObject({
      isAdmin: true,
      name: 'Grok Bot',
    })
    expect(byEmail['troelsranum@gmail.com']?.name).toBe('Troels')
    expect(byEmail['mikkellinnet@gmail.com']?.name).toBe('Mikkel')
    expect(byEmail['uffeschjoedt@gmail.com']?.name).toBe('Uffe')
    expect(PREVIEW_GUEST_ALLOWLIST).toHaveLength(7)
    expect(
      PREVIEW_GUEST_ALLOWLIST.filter((guest) => guest.isAdmin),
    ).toHaveLength(6)
  })
})

describe('upsertSharedMemberProfile', () => {
  it('opretter profilen én gang og beholder et navn, der allerede er sat', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { email: PREVIEW_MARTIN_EMAIL })
    })

    await t.run(async (ctx) => {
      await upsertSharedMemberProfile(ctx, userId, 'Martin', true)
      await upsertSharedMemberProfile(ctx, userId, 'Martin', true)
    })

    const first = await t.run(async (ctx) => ctx.db.query('profiles').collect())
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ fullName: 'Martin', isAdmin: true })

    await t.run(async (ctx) => {
      await ctx.db.patch(first[0]!._id, {
        fullName: 'Martin Jensen',
        isAdmin: false,
      })
      await upsertSharedMemberProfile(ctx, userId, 'Martin', true)
    })

    const second = await t.run(async (ctx) =>
      ctx.db.query('profiles').collect(),
    )
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({
      fullName: 'Martin Jensen',
      isAdmin: true,
    })
  })

  it('udfylder et tomt navn og sætter rollen fra listen', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      for (const guest of PREVIEW_GUEST_ALLOWLIST) {
        const userId = await ctx.db.insert('users', { email: guest.email })
        await upsertSharedMemberProfile(ctx, userId, guest.name, guest.isAdmin)
        await upsertSharedMemberProfile(ctx, userId, guest.name, guest.isAdmin)
      }
    })

    const profiles = await t.run(async (ctx) =>
      ctx.db.query('profiles').collect(),
    )
    expect(profiles).toHaveLength(PREVIEW_GUEST_ALLOWLIST.length)
    for (const guest of PREVIEW_GUEST_ALLOWLIST) {
      expect(profiles).toContainEqual(
        expect.objectContaining({
          fullName: guest.name,
          isAdmin: guest.isAdmin,
        }),
      )
    }

    const blank = profiles.find((profile) => profile.fullName === 'Grok Bot')
    await t.run(async (ctx) => {
      await ctx.db.patch(blank!._id, { fullName: '   ', isAdmin: false })
      await upsertSharedMemberProfile(ctx, blank!.userId, 'Grok Bot', true)
    })
    const filled = await t.run(async (ctx) => ctx.db.get(blank!._id))
    expect(filled).toMatchObject({ fullName: 'Grok Bot', isAdmin: true })
  })
})

describe('writePreviewSample', () => {
  it('opretter medlemskab, aktiviteter og en offentlig tur én gang', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        email: 'preview@example.com',
        name: PREVIEW_MEMBER_NAME,
      })
    })
    await t.run(async (ctx) => {
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'Preview@Example.com',
      })
    })

    await t.run(async (ctx) => {
      await writePreviewSample(ctx, userId)
      await writePreviewSample(ctx, userId)
    })

    const rows = await t.run(async (ctx) => {
      const allowed = await ctx.db.query('allowedEmails').collect()
      const profiles = await ctx.db.query('profiles').collect()
      const activities = await ctx.db.query('activities').collect()
      const events = await ctx.db.query('events').collect()
      return { allowed, profiles, activities, events }
    })

    expect(rows.allowed.map((row) => row.email).sort()).toEqual(
      [
        'preview@example.com',
        ...PREVIEW_GUEST_ALLOWLIST.map((guest) => guest.email),
      ].sort(),
    )
    expect(
      rows.allowed.find((row) => row.email === 'preview@example.com')?.isAdmin,
    ).toBe(false)
    for (const guest of PREVIEW_GUEST_ALLOWLIST) {
      expect(
        rows.allowed.find((row) => row.email === guest.email)?.isAdmin,
      ).toBe(guest.isAdmin)
    }
    expect(rows.profiles).toHaveLength(1)
    expect(rows.profiles[0]).toMatchObject({
      userId,
      fullName: PREVIEW_MEMBER_NAME,
      isAdmin: false,
    })
    expect(rows.profiles[0]?.avatarStorageId).toBeDefined()
    expect(rows.profiles[0]?.avatarUrl).toMatch(/^https?:/)
    expect(rows.activities.map((activity) => activity.title).sort()).toEqual(
      CLUB_ACTIVITIES.map((activity) => activity.title).sort(),
    )
    expect(
      rows.activities.map((activity) => activity.sortOrder).sort(),
    ).toEqual([1, 2, 3, 4, 5])
    expect(
      rows.activities.find((activity) => activity.title === 'Design af Mønter'),
    ).toMatchObject({
      linkUrl: 'https://bral.dk',
      linkLabel: 'Læs om valutaen på bral.dk',
    })
    expect(
      rows.activities.find((activity) => activity.title === 'BøsseTennisGolf'),
    ).toMatchObject({
      linkUrl: 'https://rastermanden.github.io/btg/',
      linkLabel: 'Se BøsseTennisGolf-siden',
    })
    expect(rows.events).toHaveLength(1)
    expect(rows.events[0]).toMatchObject({
      title: PREVIEW_EVENT_TITLE,
      isPublic: true,
      attendingCount: 0,
      createdBy: rows.profiles[0]!._id,
    })
    expect(rows.events[0]!.endsAt).toBeGreaterThan(Date.now())

    const messages = await t.run(async (ctx) =>
      ctx.db.query('messages').collect(),
    )
    expect(messages).toHaveLength(1)
    const scores = await t.run(async (ctx) =>
      ctx.db.query('gameScores').collect(),
    )
    expect(scores).toEqual([
      expect.objectContaining({
        game: 'kabale',
        score: PREVIEW_KABALE_SCORE,
        lines: 40,
        level: 1,
        playerId: rows.profiles[0]!._id,
      }),
    ])

    const observations = await t.run(async (ctx) =>
      ctx.db.query('observations').collect(),
    )
    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      species: PREVIEW_OBSERVATION_SPECIES,
      location: 'Skovstien',
      createdById: rows.profiles[0]!._id,
    })

    const photos = await t.run(async (ctx) => ctx.db.query('photos').collect())
    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({
      caption: PREVIEW_PHOTO_CAPTION,
      optimizationStatus: 'ready',
      albumKey: 'without-event',
    })

    expect(messages[0]).toMatchObject({
      room: 'general',
      authorId: rows.profiles[0]!._id,
      content: PREVIEW_CHAT_TEXT,
      messageType: 'text',
    })
  })

  it('retter rækkefølge og fjerner de gamle prøveaktiviteter', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { email: 'preview@example.com' })
      await ctx.db.insert('authAccounts', {
        userId: id,
        provider: 'password',
        providerAccountId: 'preview@example.com',
      })
      await ctx.db.insert('activities', {
        title: 'Skovtur',
        description: 'Gammel prøve',
        icon: 'leaf',
        sortOrder: 1,
        createdAt: 1,
      })
      await ctx.db.insert('activities', {
        title: 'Fuglekiggeri',
        description: 'Gammel prøve',
        sortOrder: 2,
        createdAt: 1,
      })
      await ctx.db.insert('activities', {
        title: 'Design af Mønter',
        description: 'Uden link',
        icon: 'leaf',
        sortOrder: 50,
        createdAt: 1,
      })
      await ctx.db.insert('activities', {
        title: 'Madkoordinering',
        description: 'Med et ikon, der ikke hører til',
        icon: 'leaf',
        sortOrder: 9,
        linkUrl: 'https://example.com',
        linkLabel: 'Forkert',
        createdAt: 1,
      })
      return id
    })

    await t.run(async (ctx) => {
      await writePreviewSample(ctx, userId)
    })

    const activities = await t.run(async (ctx) =>
      ctx.db.query('activities').collect(),
    )
    expect(activities.map((activity) => activity.title).sort()).toEqual(
      CLUB_ACTIVITIES.map((activity) => activity.title).sort(),
    )
    const coins = activities.find(
      (activity) => activity.title === 'Design af Mønter',
    )
    expect(coins).toMatchObject({
      sortOrder: 1,
      icon: 'footprints',
      linkUrl: 'https://bral.dk',
      linkLabel: 'Læs om valutaen på bral.dk',
    })
    const food = activities.find(
      (activity) => activity.title === 'Madkoordinering',
    )
    expect(food?.sortOrder).toBe(3)
    expect(food?.icon).toBeUndefined()
    expect(food?.linkUrl).toBeUndefined()
    expect(food?.linkLabel).toBeUndefined()
  })

  it('gør en oprettet V1-admin til admin og lader test-adressen være medlem', async () => {
    const t = convexTest(schema, modules)
    const previewId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { email: 'preview@example.com' })
      await ctx.db.insert('authAccounts', {
        userId: id,
        provider: 'password',
        providerAccountId: 'preview@example.com',
      })
      const martinId = await ctx.db.insert('users', {
        email: PREVIEW_MARTIN_EMAIL,
      })
      await ctx.db.insert('authAccounts', {
        userId: martinId,
        provider: 'password',
        providerAccountId: PREVIEW_MARTIN_EMAIL,
      })
      await ctx.db.insert('profiles', {
        userId: martinId,
        fullName: 'Martin',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
      await ctx.db.insert('allowedEmails', {
        email: PREVIEW_MARTIN_EMAIL,
        isAdmin: false,
      })
      const plusId = await ctx.db.insert('users', {
        email: 'kaspermoller+test@gmail.com',
      })
      await ctx.db.insert('authAccounts', {
        userId: plusId,
        provider: 'password',
        providerAccountId: 'kaspermoller+test@gmail.com',
      })
      await ctx.db.insert('profiles', {
        userId: plusId,
        fullName: 'Kasper test',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
      return id
    })

    await t.run(async (ctx) => {
      await writePreviewSample(ctx, previewId)
      await writePreviewSample(ctx, previewId)
    })

    const rows = await t.run(async (ctx) => {
      const profiles = await ctx.db.query('profiles').collect()
      const allowed = await ctx.db.query('allowedEmails').collect()
      return { profiles, allowed }
    })
    const martin = rows.profiles.find(
      (profile) => profile.fullName === 'Martin',
    )
    const plus = rows.profiles.find(
      (profile) => profile.fullName === 'Kasper test',
    )
    expect(martin?.isAdmin).toBe(true)
    expect(plus?.isAdmin).toBe(false)
    expect(
      rows.allowed.find((row) => row.email === 'kaspermoller@gmail.com')
        ?.isAdmin,
    ).toBe(true)
    expect(
      rows.allowed.find((row) => row.email === 'kaspermoller+test@gmail.com')
        ?.isAdmin,
    ).toBe(false)
    expect(
      rows.profiles.filter((profile) => profile.fullName === 'Martin'),
    ).toHaveLength(1)
  })

  it('fjerner agentmail-brugeren og lader adressen blive på listen', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        email: PREVIEW_AGENTMAIL_ADDRESS,
      })
      const accountId = await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: PREVIEW_AGENTMAIL_ADDRESS,
      })
      await ctx.db.insert('profiles', {
        userId,
        fullName: 'Agent',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 1000,
      })
      await ctx.db.insert('authRefreshTokens', {
        sessionId,
        expirationTime: Date.now() + 1000,
      })
      await ctx.db.insert('authVerificationCodes', {
        accountId,
        provider: 'password-verify',
        code: 'kode',
        expirationTime: Date.now() + 1000,
      })
      await ctx.db.insert('allowedEmails', {
        email: PREVIEW_AGENTMAIL_ADDRESS,
        isAdmin: false,
      })
      await removePasswordSignup(ctx, PREVIEW_AGENTMAIL_ADDRESS)
    })

    const left = await t.run(async (ctx) => ({
      users: await ctx.db.query('users').collect(),
      accounts: await ctx.db.query('authAccounts').collect(),
      profiles: await ctx.db.query('profiles').collect(),
      sessions: await ctx.db.query('authSessions').collect(),
      codes: await ctx.db.query('authVerificationCodes').collect(),
      allowed: await ctx.db.query('allowedEmails').collect(),
    }))
    expect(left.users).toEqual([])
    expect(left.accounts).toEqual([])
    expect(left.profiles).toEqual([])
    expect(left.sessions).toEqual([])
    expect(left.codes).toEqual([])
    expect(left.allowed.map((row) => row.email)).toEqual([
      PREVIEW_AGENTMAIL_ADDRESS,
    ])
  })

  it('rykker en forbi preview-tur frem i stedet for at lave en ny', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { email: 'preview@example.com' })
      await ctx.db.insert('authAccounts', {
        userId: id,
        provider: 'password',
        providerAccountId: 'preview@example.com',
      })
      const past = Date.now() - 7 * 24 * 60 * 60 * 1000
      await ctx.db.insert('events', {
        title: PREVIEW_EVENT_TITLE,
        startAt: past,
        endsAt: past,
        isPublic: true,
        attendingCount: 0,
        waitlistedCount: 0,
        approvedGuestCount: 0,
        createdAt: past,
      })
      return id
    })

    await t.run(async (ctx) => {
      await writePreviewSample(ctx, userId)
    })

    const events = await t.run(async (ctx) => ctx.db.query('events').collect())
    expect(events).toHaveLength(1)
    expect(events[0]!.endsAt).toBeGreaterThan(Date.now())
  })
})
