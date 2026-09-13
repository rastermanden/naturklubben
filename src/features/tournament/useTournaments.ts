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
function toMatchRows(generated: GeneratedMatch[]) {
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
      round: match.round,
      match_index: match.matchIndex,
      participant1_id: match.participant1Id,
      participant2_id: match.participant2Id,
      winner_id: match.winnerId,
      status: match.status,
      next_match_id: nextMatchId,
      next_match_slot: match.nextMatchSlot,
      bye: match.bye,
    }
  })
}

export function useTournaments() {
  const queryClient = useQueryClient()

  const tournamentsQuery = useQuery({
    queryKey: tournamentsQueryKey,
    queryFn: fetchTournaments,
  })

  const createTournament = useMutation({
    mutationFn: async ({ format, participants }: CreateTournamentInput) => {
      const participantRows = participants.map((participant, index) => ({
        id: crypto.randomUUID(),
        user_id: participant.userId,
        display_name: participant.displayName,
        seed: index + 1,
      }))

      const generatedMatches =
        format === 'round_robin'
          ? generateRoundRobinMatches(participantRows.map((row) => row.id))
          : generateSingleEliminationBracket(
              participantRows.map((row, index) => ({
                id: row.id,
                seed: index + 1,
              })),
            )

      // Opretter turneringen, dens deltagere og hele kampplanen i ét
      // atomisk kald -- et fejlet skridt kan ellers efterlade en halv,
      // uspilbar turnering uden nogen vej til at rette den op.
      const { data, error } = await supabase.rpc(
        'create_tournament_with_matches',
        {
          p_format: format,
          p_participants: participantRows,
          p_matches: toMatchRows(generatedMatches),
        },
      )
      if (error) throw error
      return data as string
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
