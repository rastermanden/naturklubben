/// <reference types="vite/client" />
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
import { BRAL_MAX_COINS_PER_GAME, bralScoreIsPlausible } from './bralRules'

const modules = import.meta.glob('./**/*.ts')

async function seedMember(
  t: ReturnType<typeof convexTest>,
  email: string,
  fullName: string,
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName,
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

describe('bralScoreIsPlausible', () => {
  it('godkender gyldige Bral-resultater og afviser umulige tal', () => {
    expect(bralScoreIsPlausible(0, 0, 1)).toBe(true)
    expect(bralScoreIsPlausible(1, 1, 1)).toBe(true)
    expect(bralScoreIsPlausible(10, 1, 1)).toBe(true)
    expect(bralScoreIsPlausible(25, 3, 1)).toBe(true)
    expect(bralScoreIsPlausible(240, 24, 1)).toBe(true)

    expect(bralScoreIsPlausible(11, 1, 1)).toBe(false)
    expect(bralScoreIsPlausible(0, 1, 1)).toBe(false)
    expect(bralScoreIsPlausible(2, 3, 1)).toBe(false)
    expect(bralScoreIsPlausible(250, 25, 1)).toBe(false)
    expect(bralScoreIsPlausible(10, 1, 2)).toBe(false)
  })
})

describe('games.submit bral', () => {
  it('gemmer resultatet på resultatlisten og under seneste spil', async () => {
    const t = convexTest(schema, modules)
    const spiller1 = await seedMember(t, 'spiller1@example.com', 'Spiller 1')
    const spiller2 = await seedMember(t, 'spiller2@example.com', 'Spiller 2')

    await t
      .withIdentity({ subject: spiller1.userId })
      .mutation(api.games.submit, {
        game: 'bral',
        score: 25,
        lines: 3,
        level: 1,
        durationSeconds: 60,
      })
    await t
      .withIdentity({ subject: spiller2.userId })
      .mutation(api.games.submit, {
        game: 'bral',
        score: 40,
        lines: 4,
        level: 1,
        durationSeconds: 60,
      })

    const board = await t
      .withIdentity({ subject: spiller1.userId })
      .query(api.games.leaderboard, { game: 'bral' })
    expect(board).toEqual([
      expect.objectContaining({
        game: 'bral',
        playerId: spiller2.profileId,
        playerName: 'Spiller 2',
        score: 40,
        lines: 4,
        level: 1,
      }),
      expect.objectContaining({
        game: 'bral',
        playerId: spiller1.profileId,
        playerName: 'Spiller 1',
        score: 25,
        lines: 3,
        level: 1,
      }),
    ])

    const recent = await t
      .withIdentity({ subject: spiller1.userId })
      .query(api.games.recent, { game: 'bral' })
    expect(recent).toHaveLength(2)

    const spiller1Best = await t
      .withIdentity({ subject: spiller1.userId })
      .query(api.games.personalBest, { game: 'bral' })
    const spiller2Best = await t
      .withIdentity({ subject: spiller2.userId })
      .query(api.games.personalBest, { game: 'bral' })
    expect(spiller1Best).toMatchObject({
      score: 25,
      playerId: spiller1.profileId,
    })
    expect(spiller2Best).toMatchObject({
      score: 40,
      playerId: spiller2.profileId,
    })
  })

  it('afviser umulige Bral-resultater uden at gemme dem', async () => {
    const t = convexTest(schema, modules)
    const spiller1 = await seedMember(t, 'spiller1@example.com', 'Spiller 1')

    for (const bad of [
      { score: 50, lines: 1, level: 1 },
      { score: 250, lines: BRAL_MAX_COINS_PER_GAME + 1, level: 1 },
      { score: 0, lines: 1, level: 1 },
      { score: 10, lines: 1, level: 2 },
    ]) {
      const failure = await t
        .withIdentity({ subject: spiller1.userId })
        .mutation(api.games.submit, {
          game: 'bral',
          ...bad,
          durationSeconds: 60,
        })
        .then(
          () => null,
          (error: unknown) => error,
        )

      expect(failure).toBeInstanceOf(ConvexError)
      expect(JSON.parse((failure as ConvexError<string>).data)).toBe(
        'SCORE_NOT_PLAUSIBLE',
      )
    }

    const board = await t
      .withIdentity({ subject: spiller1.userId })
      .query(api.games.leaderboard, { game: 'bral' })
    expect(board).toEqual([])
  })
})
