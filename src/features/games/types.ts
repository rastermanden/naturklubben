/** Spil, der kan lægge resultater på klubbens liste. Skal matche
 *  `game_scores_game_known` i databasen. */
export type GameId = 'tetris' | 'kaper' | '2048'

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
  /** Ryddede rækker i Tetris, antal træk i Kaptajn Kaper; 0 i 2048. */
  lines: number
  /** Niveau i Tetris, rang i Kaptajn Kaper; 1 i 2048. */
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
  /** Udelades af spil, hvor kolonnerne ikke betyder noget; databasen sætter
   *  så sine standardværdier (0 og 1). */
  lines?: number
  level?: number
  durationSeconds: number
}
