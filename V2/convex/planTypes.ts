/**
 * Kampbeskrivelsen, som kampgenereringen arbejder med -- uden en database.
 *
 * Kopieret uændret fra `src/features/tournament/types.ts` i den gamle app, hvor
 * den var DB-uafhængig. Filerne her (`bracket.ts`, `roundRobin.ts`, `rules.ts`)
 * er også kopieret, så matematikken er den samme som før; kun dette stednavn
 * er nyt, fordi resten af den gamle `types.ts` beskrev Postgres-rækker med
 * snake_case, som V2 ikke har.
 */
export interface GeneratedMatch {
  round: number
  matchIndex: number
  participant1Id: string | null
  participant2Id: string | null
  winnerId: string | null
  status: 'pending' | 'completed'
  nextMatchRound: number | null
  nextMatchIndex: number | null
  nextMatchSlot: 1 | 2 | null
  /** Kampens anden plads bliver aldrig udfyldt -- se `bracket.ts`. */
  bye: boolean
  /** Antal spil, kampen højst går over: 3 for de fleste, 5 for finalen. */
  bestOf: number
}
