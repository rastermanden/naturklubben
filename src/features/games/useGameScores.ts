import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { GameId, GameScore, NewGameScore } from './types'

/**
 * Hvor mange resultater der hentes til listen. Toppen af listen er dét, der
 * interesserer nogen, og et medlems bedste resultat kan per definition ikke
 * ligge uden for de bedste 200, hvis medlemmet skal være blandt de bedste 200.
 */
const LEADERBOARD_LIMIT = 200

/** Hvor mange spil "Seneste spil" viser. */
const RECENT_LIMIT = 12

const scoreFields =
  'id, game, player_id, score, lines, level, duration_seconds, created_at, player:profiles(id, full_name, avatar_url)'

export function leaderboardQueryKey(game: GameId) {
  return ['game_scores', game, 'leaderboard'] as const
}

export function recentScoresQueryKey(game: GameId) {
  return ['game_scores', game, 'recent'] as const
}

export function personalBestQueryKey(game: GameId, playerId: string) {
  return ['game_scores', game, 'best', playerId] as const
}

async function fetchLeaderboard(game: GameId): Promise<GameScore[]> {
  const { data, error } = await supabase
    .from('game_scores')
    .select(scoreFields)
    .eq('game', game)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(LEADERBOARD_LIMIT)

  if (error) throw error
  return (data ?? []) as unknown as GameScore[]
}

export function useLeaderboard(game: GameId) {
  return useQuery({
    queryKey: leaderboardQueryKey(game),
    queryFn: () => fetchLeaderboard(game),
  })
}

async function fetchRecentScores(game: GameId): Promise<GameScore[]> {
  const { data, error } = await supabase
    .from('game_scores')
    .select(scoreFields)
    .eq('game', game)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT)

  if (error) throw error
  return (data ?? []) as unknown as GameScore[]
}

export function useRecentScores(game: GameId) {
  return useQuery({
    queryKey: recentScoresQueryKey(game),
    queryFn: () => fetchRecentScores(game),
  })
}

/**
 * Spillerens eget bedste resultat. Det hentes for sig, fordi et medlem, der
 * endnu ikke er inde på listen, stadig skal kunne se sin egen rekord.
 */
export function usePersonalBest(game: GameId, playerId: string | undefined) {
  return useQuery({
    queryKey: personalBestQueryKey(game, playerId ?? ''),
    enabled: Boolean(playerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_scores')
        .select(scoreFields)
        .eq('game', game)
        .eq('player_id', playerId!)
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return (data ?? null) as unknown as GameScore | null
    },
  })
}

export function useSubmitScore(game: GameId, playerId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (result: NewGameScore) => {
      if (!playerId) throw new Error('Ikke logget ind')
      const { error } = await supabase.from('game_scores').insert({
        game,
        player_id: playerId,
        score: result.score,
        lines: result.lines,
        level: result.level,
        duration_seconds: result.durationSeconds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['game_scores', game] })
    },
  })
}

export function useDeleteScore(game: GameId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scoreId: string) => {
      const { error } = await supabase
        .from('game_scores')
        .delete()
        .eq('id', scoreId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['game_scores', game] })
    },
  })
}
