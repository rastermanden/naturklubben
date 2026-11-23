/// <reference types="vite/client" />
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import {
  createTestConvex,
  withAuthUser,
  type TestConvexInstance,
} from '../test/convexTestAuth'
import { api } from './_generated/api'
import { bobleScoreIsPlausible } from './games'

async function seedMember(
  t: TestConvexInstance,
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

describe('bobleScoreIsPlausible', () => {
  it('godkender én punktering på første bane og afviser flere point', () => {
    expect(bobleScoreIsPlausible(100, 1, 1)).toBe(true)
    expect(bobleScoreIsPlausible(200, 2, 1)).toBe(true)
    expect(bobleScoreIsPlausible(300, 2, 1)).toBe(false)
    expect(bobleScoreIsPlausible(100, 3, 1)).toBe(false)
  })
})

describe('games.submit boble', () => {
  it('gemmer resultatet på spillerens egen liste', async () => {
    const t = createTestConvex()
    const martin = await seedMember(t, 'martin@example.com', 'Martin')
    const kasper = await seedMember(t, 'kasper@example.com', 'Kasper')

    await (
      await withAuthUser(t, martin.userId)
    ).mutation(api.games.submit, {
      game: 'boble',
      score: 100,
      lines: 1,
      level: 1,
      durationSeconds: 20,
    })
    await (
      await withAuthUser(t, kasper.userId)
    ).mutation(api.games.submit, {
      game: 'boble',
      score: 200,
      lines: 2,
      level: 1,
      durationSeconds: 40,
    })

    const board = await (
      await withAuthUser(t, martin.userId)
    ).query(api.games.leaderboard, { game: 'boble' })
    expect(board).toEqual([
      expect.objectContaining({
        game: 'boble',
        playerId: kasper.profileId,
        playerName: 'Kasper',
        score: 200,
        lines: 2,
        level: 1,
      }),
      expect.objectContaining({
        game: 'boble',
        playerId: martin.profileId,
        playerName: 'Martin',
        score: 100,
        lines: 1,
        level: 1,
      }),
    ])

    const martinBest = await (
      await withAuthUser(t, martin.userId)
    ).query(api.games.personalBest, { game: 'boble' })
    const kasperBest = await (
      await withAuthUser(t, kasper.userId)
    ).query(api.games.personalBest, { game: 'boble' })
    expect(martinBest).toMatchObject({ score: 100, playerId: martin.profileId })
    expect(kasperBest).toMatchObject({ score: 200, playerId: kasper.profileId })
  })

  it('afviser et resultat, banen ikke kan give', async () => {
    const t = createTestConvex()
    const martin = await seedMember(t, 'martin@example.com', 'Martin')
    const failure = await (
      await withAuthUser(t, martin.userId)
    )
      .mutation(api.games.submit, {
        game: 'boble',
        score: 500,
        lines: 1,
        level: 1,
        durationSeconds: 10,
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(ConvexError)
    expect((failure as ConvexError<string>).data).toBe('SCORE_NOT_PLAUSIBLE')
    const board = await (
      await withAuthUser(t, martin.userId)
    ).query(api.games.leaderboard, { game: 'boble' })
    expect(board).toEqual([])
  })
})
