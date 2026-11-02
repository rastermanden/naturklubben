export interface TournamentMatch {
  id: string
  tournament_id: string
  round: number
  match_index: number
  participant1_id: string | null
  participant2_id: string | null
  winner_id: string | null
  status: 'pending' | 'completed'
  next_match_id: string | null
  next_match_slot: 1 | 2 | null
  bye: boolean
  best_of: number
}
