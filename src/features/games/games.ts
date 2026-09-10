import { formatDuration } from './leaderboard'
import { rankName } from './kaper/engine'
import type { GameId, GameScore } from './types'

export interface GameDefinition {
  id: GameId
  title: string
  /** Én linje om, hvad spillet går ud på -- ikke en manual. */
  tagline: string
  path: string
  /** Et tegn frem for et billede: ingen filer at hente, virker i begge temaer. */
  symbol: string
  /**
   * Linjen under navnet på resultatlisten. Kolonnerne i `game_scores` er de
   * samme for alle spil, men de betyder noget forskelligt: `lines` er rækker i
   * Tetris og træk i Kaptajn Kaper, og niveauet dér er en rang.
   */
  describeScore: (score: GameScore) => string
}

/**
 * Spillene i klubben. Listen er ét sted, så en ny leg kun skal skrives ind her
 * for at dukke op på oversigten -- og i databasens `game_scores_game_known`.
 */
export const games: readonly GameDefinition[] = [
  {
    id: 'tetris',
    title: 'Tetris',
    tagline:
      'Klassikeren: drej brikkerne på plads, fyld rækkerne ud, og se hvor længe du kan holde til det.',
    path: '/spil/tetris',
    symbol: '🟦',
    describeScore: (score) =>
      `${score.lines} rækker · niveau ${score.level} · ${formatDuration(score.duration_seconds)}`,
  },
  {
    id: 'kaper',
    title: 'Kaptajn Kaper i Kattegat',
    tagline:
      "Kaperbrev fra kongen, engelske skibe i Kattegat og en komtesse, der ikke venter evigt. Fra 1980'ernes hjemmecomputer.",
    path: '/spil/kaper',
    symbol: '⛵',
    describeScore: (score) =>
      `${score.lines} træk · ${rankName(score.level)} · ${formatDuration(score.duration_seconds)}`,
  },
]

export function gameById(id: GameId): GameDefinition {
  const game = games.find((candidate) => candidate.id === id)
  if (!game) throw new Error(`Ukendt spil: ${id}`)
  return game
}
