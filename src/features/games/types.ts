/** Spil, der kan lægge resultater på klubbens liste. Skal matche
 *  `game_scores_game_known` i databasen. */
export type GameId = 'tetris'

export interface GamePlayer {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export interface GameScore {
  id: string
  game: GameId
  player_id: string
  score: number
  lines: number
  level: number
  duration_seconds: number
  created_at: string
  player: GamePlayer | null
}

/** Et medlems bedste resultat, med pladsen på listen regnet med. */
export interface LeaderboardEntry {
  /** 1, 2, 3 ... Lige resultater deler plads. */
  rank: number
  score: GameScore
}

export interface NewGameScore {
  score: number
  lines: number
  level: number
  durationSeconds: number
}
