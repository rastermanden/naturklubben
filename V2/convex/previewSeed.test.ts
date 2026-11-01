/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from './schema'
import {
  PREVIEW_ACTIVITIES,
  PREVIEW_CHAT_TEXT,
  PREVIEW_KABALE_SCORE,
  PREVIEW_OBSERVATION_SPECIES,
  PREVIEW_PHOTO_CAPTION,
  PREVIEW_EVENT_TITLE,
  PREVIEW_MEMBER_NAME,
  PROD_DEPLOYMENT_SLUG,
  assertPreviewSeedAllowed,
  normalizePreviewEmail,
  normalizePreviewPassword,
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

    expect(rows.allowed).toEqual([
      expect.objectContaining({ email: 'preview@example.com', isAdmin: false }),
    ])
    expect(rows.profiles).toHaveLength(1)
    expect(rows.profiles[0]).toMatchObject({
      userId,
      fullName: PREVIEW_MEMBER_NAME,
      isAdmin: false,
    })
    expect(rows.profiles[0]?.avatarStorageId).toBeDefined()
    expect(rows.profiles[0]?.avatarUrl).toMatch(/^https?:/)
    expect(rows.activities.map((activity) => activity.title).sort()).toEqual(
      PREVIEW_ACTIVITIES.map((activity) => activity.title).sort(),
    )
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
