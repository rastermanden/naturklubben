/// <reference types="vite/client" />
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
import {
  BRAL_DURATION_SECONDS,
  BRAL_MAX_COINS_PER_GAME,
  bralScoreIsPlausible,
} from './bralRules'

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
  it('godkender gyldige møntkombinationer på 60 sekunder og afviser umulige pointtal og varigheder', () => {
    const validDuration = BRAL_DURATION_SECONDS
    expect(bralScoreIsPlausible(0, 0, 1, validDuration)).toBe(true)
    expect(bralScoreIsPlausible(1, 1, 1, validDuration)).toBe(true)
    expect(bralScoreIsPlausible(5, 1, 1, validDuration)).toBe(true)
    expect(bralScoreIsPlausible(10, 1, 1, validDuration)).toBe(true)
    expect(bralScoreIsPlausible(16, 3, 1, validDuration)).toBe(true)
    expect(bralScoreIsPlausible(25, 3, 1, validDuration)).toBe(true)
    expect(bralScoreIsPlausible(230, 23, 1, validDuration)).toBe(true)

    expect(bralScoreIsPlausible(2, 1, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(6, 1, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(9, 2, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(26, 3, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(11, 1, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(0, 1, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(2, 3, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(240, 24, 1, validDuration)).toBe(false)
    expect(bralScoreIsPlausible(10, 1, 2, validDuration)).toBe(false)

    expect(bralScoreIsPlausible(230, 23, 1, 1)).toBe(false)
    expect(bralScoreIsPlausible(10, 1, 1, 0)).toBe(false)
    expect(bralScoreIsPlausible(10, 1, 1, 59)).toBe(false)
    expect(bralScoreIsPlausible(10, 1, 1, 61)).toBe(false)
    expect(bralScoreIsPlausible(10, 1, 1, 59.5)).toBe(false)
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
        score: 16,
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
        score: 16,
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
      score: 16,
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

    const badCases: Array<{
      score: number
      lines: number
      level: number
      durationSeconds?: number
    }> = [
      { score: 2, lines: 1, level: 1 },
      { score: 26, lines: 3, level: 1 },
      { score: 50, lines: 1, level: 1 },
      {
        score: (BRAL_MAX_COINS_PER_GAME + 1) * 10,
        lines: BRAL_MAX_COINS_PER_GAME + 1,
        level: 1,
      },
      { score: 0, lines: 1, level: 1 },
      { score: 10, lines: 1, level: 2 },
      { score: 230, lines: 23, level: 1, durationSeconds: 1 },
      { score: 10, lines: 1, level: 1, durationSeconds: 59 },
      { score: 10, lines: 1, level: 1, durationSeconds: 61 },
    ]

    for (const bad of badCases) {
      const failure = await t
        .withIdentity({ subject: spiller1.userId })
        .mutation(api.games.submit, {
          game: 'bral',
          score: bad.score,
          lines: bad.lines,
          level: bad.level,
          durationSeconds: bad.durationSeconds ?? BRAL_DURATION_SECONDS,
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
