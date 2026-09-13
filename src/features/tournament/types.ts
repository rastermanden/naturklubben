export type TournamentFormat = 'round_robin' | 'single_elimination'
export type TournamentStatus = 'setup' | 'in_progress' | 'completed'
export type MatchStatus = 'pending' | 'completed'

export interface Tournament {
  id: string
  format: TournamentFormat
  status: TournamentStatus
  created_by: string | null
  created_at: string
}

export interface TournamentParticipant {
  id: string
  tournament_id: string
  user_id: string | null
  display_name: string
  seed: number
}

export interface TournamentMatch {
  id: string
  tournament_id: string
  round: number
  match_index: number
  participant1_id: string | null
  participant2_id: string | null
  winner_id: string | null
  status: MatchStatus
  next_match_id: string | null
  next_match_slot: 1 | 2 | null
  /** Kampens anden plads bliver aldrig udfyldt -- se bracket.ts. */
  bye: boolean
}

export interface TournamentGame {
  id: string
  match_id: string
  game_number: 1 | 2 | 3
  winner_id: string
}

/**
 * DB-uafhængig kamp-beskrivelse, som kampgenereringen (round robin/bracket)
 * arbejder med. `round`/`matchIndex` adresserer kampen inden for turneringen;
 * `nextMatchRound`/`nextMatchIndex`/`nextMatchSlot` peger på, hvor en
 * afgjort bye's vinder skal stå -- oversættes til rigtige `next_match_id`,
 * når kampene indsættes i databasen (se useTournaments.ts).
 */
export interface GeneratedMatch {
  round: number
  matchIndex: number
  participant1Id: string | null
  participant2Id: string | null
  winnerId: string | null
  status: MatchStatus
  nextMatchRound: number | null
  nextMatchIndex: number | null
  nextMatchSlot: 1 | 2 | null
  /** Kampens anden plads bliver aldrig udfyldt -- se bracket.ts. */
  bye: boolean
}
