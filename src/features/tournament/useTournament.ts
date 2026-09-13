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
          'id, tournament_id, round, match_index, participant1_id, participant2_id, winner_id, status, next_match_id, next_match_slot',
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

async function roundRobinIsComplete(tournamentId: string) {
  const { count, error } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
  if (error) throw error
  return (count ?? 0) === 0
}

async function maybeCompleteTournament(
  tournamentId: string,
  wasFinalBracketMatch: boolean,
) {
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .single()
  if (error) throw error

  const isDone =
    tournament.format === 'single_elimination'
      ? wasFinalBracketMatch
      : await roundRobinIsComplete(tournamentId)

  if (!isDone) return
  const { error: completeError } = await supabase
    .from('tournaments')
    .update({ status: 'completed' })
    .eq('id', tournamentId)
  if (completeError) throw completeError
}

/** Enkeltspilsvindere i rækkefølge (spil 1, spil 2, evt. spil 3). */
function matchWinnerFromGames(gameWinnerIds: string[]) {
  const wins = new Map<string, number>()
  for (const id of gameWinnerIds) wins.set(id, (wins.get(id) ?? 0) + 1)
  return [...wins.entries()].find(([, count]) => count >= 2)?.[0] ?? null
}

export function useTournament(tournamentId: string) {
  const queryClient = useQueryClient()
  const queryKey = tournamentQueryKey(tournamentId)

  const tournamentQuery = useQuery({
    queryKey,
    queryFn: () => fetchTournamentDetail(tournamentId),
  })

  const recordMatchResult = useMutation({
    mutationFn: async ({
      matchId,
      gameWinnerIds,
    }: {
      matchId: string
      gameWinnerIds: string[]
    }) => {
      const winnerId = matchWinnerFromGames(gameWinnerIds)
      if (!winnerId) {
        throw new Error('Kampen kan ikke afgøres uden en vinder af 2 spil')
      }

      const { error: gamesError } = await supabase
        .from('tournament_games')
        .insert(
          gameWinnerIds.map((gameWinnerId, index) => ({
            match_id: matchId,
            game_number: index + 1,
            winner_id: gameWinnerId,
          })),
        )
      if (gamesError) throw gamesError

      const { data: match, error: matchError } = await supabase
        .from('tournament_matches')
        .update({ status: 'completed', winner_id: winnerId })
        .eq('id', matchId)
        .select('tournament_id, next_match_id, next_match_slot')
        .single()
      if (matchError) throw matchError

      if (match.next_match_id && match.next_match_slot) {
        const slotColumn =
          match.next_match_slot === 1 ? 'participant1_id' : 'participant2_id'
        const { error: advanceError } = await supabase
          .from('tournament_matches')
          .update({ [slotColumn]: winnerId })
          .eq('id', match.next_match_id)
        if (advanceError) throw advanceError
      }

      await maybeCompleteTournament(
        match.tournament_id,
        match.next_match_id === null,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: tournamentsQueryKey })
    },
  })

  return { tournamentQuery, recordMatchResult }
}
