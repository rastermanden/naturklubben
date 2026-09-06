import type { GameId } from './types'

export interface GameDefinition {
  id: GameId
  title: string
  /** Én linje om, hvad spillet går ud på -- ikke en manual. */
  tagline: string
  path: string
  /** Et tegn frem for et billede: ingen filer at hente, virker i begge temaer. */
  symbol: string
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
  },
]
