import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatScore,
  playerName,
  rankLeaderboard,
} from './leaderboard'
import type { GameScore } from './types'

function score(
  playerId: string,
  points: number,
  overrides: Partial<GameScore> = {},
): GameScore {
  return {
    id: `${playerId}-${points}`,
    game: 'tetris',
    player_id: playerId,
    score: points,
    lines: 10,
    level: 2,
    duration_seconds: 120,
    created_at: '2026-09-06T12:00:00.000Z',
    player: { id: playerId, full_name: playerId, avatar_url: null },
    ...overrides,
  }
}

describe('rankLeaderboard', () => {
  it('viser hvert medlem én gang med deres bedste resultat', () => {
    const entries = rankLeaderboard([
      score('alice', 5000),
      score('bob', 4000),
      score('alice', 3000),
      score('carol', 1000),
    ])

    expect(entries.map((entry) => entry.score.player_id)).toEqual([
      'alice',
      'bob',
      'carol',
    ])
    expect(entries.map((entry) => entry.score.score)).toEqual([
      5000, 4000, 1000,
    ])
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3])
  })

  it('lader lige resultater dele plads', () => {
    const entries = rankLeaderboard([
      score('alice', 5000),
      score('bob', 4000),
      score('carol', 4000),
      score('dan', 1000),
    ])

    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 4])
  })

  it('klarer en tom liste', () => {
    expect(rankLeaderboard(undefined)).toEqual([])
    expect(rankLeaderboard([])).toEqual([])
  })
})

describe('formatDuration', () => {
  it('skriver varigheden, som man siger den', () => {
    expect(formatDuration(0)).toBe('0 sek')
    expect(formatDuration(45)).toBe('45 sek')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(192)).toBe('3 min 12 sek')
    expect(formatDuration(3600)).toBe('1 t')
    expect(formatDuration(3900)).toBe('1 t 5 min')
  })
})

describe('formatScore og playerName', () => {
  it('sætter tusindtalsskilletegn efter dansk skik', () => {
    expect(formatScore(1234567)).toBe('1.234.567')
  })

  it('kalder et medlem uden navn for ukendt', () => {
    expect(playerName(score('alice', 10))).toBe('alice')
    expect(playerName(score('alice', 10, { player: null }))).toBe(
      'Ukendt medlem',
    )
    expect(
      playerName(
        score('alice', 10, {
          player: { id: 'alice', full_name: '   ', avatar_url: null },
        }),
      ),
    ).toBe('Ukendt medlem')
  })
})
