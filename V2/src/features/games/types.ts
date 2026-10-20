/** Spil, der kan lægge resultater på klubbens liste. Skal matche
 *  `gameIdValidator` i `convex/tables/community.ts`. */
export type GameId =
  | 'tetris'
  | 'kaper'
  | '2048'
  | 'naturquiz'
  | 'sti'
  | 'fugletraek'

/**
 * Et resultat, som det ligger i `gameScores` i Convex.
 *
 * Feltnavnene er camelCase og `_id`/`_creationTime` kommer fra Convex selv.
 * `playerName` er en kopi af navnet ved indsendelsen: en Convex-query kan ikke
 * joine med `profiles`, og resultatlisten skal ikke slå et opslag op pr. række.
 */
export interface GameScore {
  _id: string
  _creationTime: number
  game: GameId
  playerId: string
  playerName: string
  score: number
  /** Ryddede rækker i Tetris, antal træk i Kaptajn Kaper, antal rigtige svar
   *  (ud af 10) i Naturquiz, poster i Stifinderen, vendinger i Fugletræk;
   *  0 i 2048. */
  lines: number
  /** Niveau i Tetris, rang i Kaptajn Kaper, baneklasse i Stifinderen,
   *  bræt-klasse i Fugletræk; 1 i 2048 og Naturquiz. */
  level: number
  durationSeconds: number
  createdAt: number
}

/** Et medlems bedste resultat, med pladsen på listen regnet med. */
export interface LeaderboardEntry {
  /** 1, 2, 3 ... Lige resultater deler plads. */
  rank: number
  score: GameScore
}

export interface NewGameScore {
  score: number
  /** Udelades af spil, hvor kolonnerne ikke betyder noget; databasen satte
   *  sine standardværdier (0 og 1), og mutationen gør det samme. */
  lines?: number
  level?: number
  durationSeconds: number
}
