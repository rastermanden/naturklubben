import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { tournamentsQueryKey } from './useTournaments'
import type {
  Tournament,
  TournamentGame,
  TournamentMatch,
  TournamentParticipant,
} from './types'

export interface TournamentDetail {
  tournament: Tournament
  participants: TournamentParticipant[]
  matches: TournamentMatch[]
  games: TournamentGame[]
}

export function tournamentQueryKey(tournamentId: string) {
  return [...tournamentsQueryKey, tournamentId] as const
}

async function fetchTournamentDetail(
  tournamentId: string,
): Promise<TournamentDetail> {
  const [tournamentResult, participantsResult, matchesResult] =
    await Promise.all([
      supabase
        .from('tournaments')
        .select('id, format, status, created_by, created_at')
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('tournament_participants')
        .select('id, tournament_id, user_id, display_name, seed')
        .eq('tournament_id', tournamentId)
        .order('seed'),
      supabase
        .from('tournament_matches')
        .select(
          'id, tournament_id, round, match_index, participant1_id, participant2_id, winner_id, status, next_match_id, next_match_slot, bye',
        )
        .eq('tournament_id', tournamentId)
        .order('round')
        .order('match_index'),
    ])
  if (tournamentResult.error) throw tournamentResult.error
  if (participantsResult.error) throw participantsResult.error
  if (matchesResult.error) throw matchesResult.error

  const matchIds = matchesResult.data.map((match) => match.id)
  const gamesResult = matchIds.length
    ? await supabase
        .from('tournament_games')
        .select('id, match_id, game_number, winner_id')
        .in('match_id', matchIds)
        .order('game_number')
    : { data: [] as TournamentGame[], error: null }
  if (gamesResult.error) throw gamesResult.error

  return {
    tournament: tournamentResult.data,
    participants: participantsResult.data,
    matches: matchesResult.data,
    games: gamesResult.data ?? [],
  }
}

export function useTournament(tournamentId: string) {
  const queryClient = useQueryClient()
  const queryKey = tournamentQueryKey(tournamentId)

  const tournamentQuery = useQuery({
    queryKey,
    queryFn: () => fetchTournamentDetail(tournamentId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: tournamentsQueryKey })
  }

  // Udregner kampvinderen, gemmer resultatet, rykker vinderen videre til
  // næste bracket-kamp og markerer turneringen afsluttet, når den er det --
  // alt i ét atomisk RPC-kald, se 20260913130000_tournament_rpcs.sql.
  const recordMatchResult = useMutation({
    mutationFn: async ({
      matchId,
      gameWinnerIds,
    }: {
      matchId: string
      gameWinnerIds: string[]
    }) => {
      const { error } = await supabase.rpc('record_tournament_match_result', {
        p_match_id: matchId,
        p_game_winner_ids: gameWinnerIds,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Fortryder en afgjort kamp. RPC'en selv afviser det, hvis det ikke er
  // trygt (en bye, eller en efterfølgende kamp, der allerede er afgjort).
  const undoMatchResult = useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await supabase.rpc('undo_tournament_match_result', {
        p_match_id: matchId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { tournamentQuery, recordMatchResult, undoMatchResult }
}
