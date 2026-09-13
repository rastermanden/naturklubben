import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { generateSingleEliminationBracket } from './bracket'
import { generateRoundRobinMatches } from './roundRobin'
import type { GeneratedMatch, Tournament, TournamentFormat } from './types'

export const tournamentsQueryKey = ['tournaments'] as const

async function fetchTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, format, status, created_by, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export interface NewTournamentParticipant {
  userId: string
  displayName: string
}

interface CreateTournamentInput {
  format: TournamentFormat
  participants: NewTournamentParticipant[]
}

/**
 * Oversætter den DB-uafhængige kampliste til rigtige rækker: hver kamp får
 * sit eget uuid med det samme, så `next_match_id` kan pege direkte på den
 * kamp, der endnu ikke er indsat.
 */
function toMatchRows(tournamentId: string, generated: GeneratedMatch[]) {
  const idByRoundAndIndex = new Map<string, string>()
  for (const match of generated) {
    idByRoundAndIndex.set(
      `${match.round}:${match.matchIndex}`,
      crypto.randomUUID(),
    )
  }

  return generated.map((match) => {
    const nextMatchId =
      match.nextMatchRound !== null && match.nextMatchIndex !== null
        ? (idByRoundAndIndex.get(
            `${match.nextMatchRound}:${match.nextMatchIndex}`,
          ) ?? null)
        : null

    return {
      id: idByRoundAndIndex.get(`${match.round}:${match.matchIndex}`)!,
      tournament_id: tournamentId,
      round: match.round,
      match_index: match.matchIndex,
      participant1_id: match.participant1Id,
      participant2_id: match.participant2Id,
      winner_id: match.winnerId,
      status: match.status,
      next_match_id: nextMatchId,
      next_match_slot: match.nextMatchSlot,
    }
  })
}

export function useTournaments(userId: string) {
  const queryClient = useQueryClient()

  const tournamentsQuery = useQuery({
    queryKey: tournamentsQueryKey,
    queryFn: fetchTournaments,
  })

  const createTournament = useMutation({
    mutationFn: async ({ format, participants }: CreateTournamentInput) => {
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .insert({ format, status: 'in_progress', created_by: userId })
        .select('id')
        .single()
      if (tournamentError) throw tournamentError

      const participantRows = participants.map((participant, index) => ({
        id: crypto.randomUUID(),
        tournament_id: tournament.id,
        user_id: participant.userId,
        display_name: participant.displayName,
        seed: index + 1,
      }))
      const { error: participantsError } = await supabase
        .from('tournament_participants')
        .insert(participantRows)
      if (participantsError) throw participantsError

      const generatedMatches =
        format === 'round_robin'
          ? generateRoundRobinMatches(participantRows.map((row) => row.id))
          : generateSingleEliminationBracket(
              participantRows.map((row, index) => ({
                id: row.id,
                seed: index + 1,
              })),
            )
      const { error: matchesError } = await supabase
        .from('tournament_matches')
        .insert(toMatchRows(tournament.id, generatedMatches))
      if (matchesError) throw matchesError

      return tournament.id as string
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tournamentsQueryKey }),
  })

  const deleteTournament = useMutation({
    mutationFn: async (tournamentId: string) => {
      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', tournamentId)
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tournamentsQueryKey }),
  })

  return { tournamentsQuery, createTournament, deleteTournament }
}
