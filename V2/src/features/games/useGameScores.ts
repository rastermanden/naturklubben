import { useCallback, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { GameId, NewGameScore } from './types'

/**
 * Klientens adgang til spillenes resultater.
 *
 * Der er ingen react-query her: Convex' `useQuery` *er* abonnementet, og
 * cachen opdateres af sig selv, når en mutation ændrer `gameScores`. Det gør
 * `invalidateQueries` overflødigt -- og det er grunden til, at denne fil er
 * skrevet om frem for kopieret: den gamle udgave talte med Supabase.
 *
 * Spilleren kendes kun af serveren (`requireWritableProfile`), men siderne skal
 * vise "dig", "ny personlig rekord" og en påmindelse til den, der ikke er logget
 * ind. Derfor `myPlayer`, som er ét opslag og ikke en profil­gennemlæsning.
 */

/** Den indloggede spiller, eller `undefined` mens svaret er på vej. */
export function usePlayer() {
  return useQuery(api.games.myPlayer)
}

export function usePlayerId(): string | undefined {
  return usePlayer()?.profileId
}

/** Spillerens navn, så fx Kaptajn Kaper kan foreslå et kaptajnsnavn. */
export function usePlayerName(): string {
  return usePlayer()?.displayName ?? ''
}

/**
 * Resultatlisten: de bedste point først. Convex-queryen læser et begrænset
 * vindue af indekset `by_game_score`, og `rankLeaderboard` tager det bedste
 * resultat pr. medlem og giver pladser.
 */
export function useLeaderboard(game: GameId, limit?: number) {
  return useQuery(api.games.leaderboard, { game, limit })
}

/** De seneste partier for ét spil. */
export function useRecentScores(game: GameId) {
  return useQuery(api.games.recent, { game })
}

/** Spillerens eget bedste resultat, så rekorden kan vises før listen. */
export function usePersonalBest(game: GameId) {
  const data = useQuery(api.games.personalBest, { game })
  return { data }
}

interface SubmitState {
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  error: string | null
}

const idle: SubmitState = {
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Ukendt fejl'
}

/**
 * Indsender et resultat. Spilleren er den indloggede -- der er ingen
 * `playerId`-parameter, hverken her eller i mutationen.
 *
 * Formen (`mutate`, `isPending`, `isError`, `isSuccess`) er den samme som den
 * gamle react-query-mutation, så spillenes komponenter kunne kopieres uændret.
 */
export function useSubmitScore(game: GameId) {
  const submit = useMutation(api.games.submit)
  const [state, setState] = useState<SubmitState>(idle)

  const mutate = useCallback(
    (result: NewGameScore) => {
      setState({ ...idle, isPending: true })
      submit({
        game,
        score: result.score,
        lines: result.lines,
        level: result.level,
        durationSeconds: result.durationSeconds,
      })
        .then(() => {
          setState({ ...idle, isSuccess: true })
        })
        .catch((error: unknown) => {
          setState({ ...idle, isError: true, error: describeError(error) })
        })
    },
    [game, submit],
  )

  return { ...state, mutate }
}

/** Sletter et resultat -- sit eget eller, som admin, en andens. */
export function useDeleteScore() {
  const remove = useMutation(api.games.remove)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutate = useCallback(
    (scoreId: string) => {
      setPendingId(scoreId)
      setError(null)
      // Id'et kommer fra en Convex-query og er derfor et rigtigt id; typen i
      // `GameScore` er brednet til string, så de rene funktioner i
      // `leaderboard.ts` kan testes uden Convex' genererede typer.
      remove({ scoreId: scoreId as Id<'gameScores'> })
        .catch((cause: unknown) => {
          setError(describeError(cause))
        })
        .finally(() => {
          setPendingId(null)
        })
    },
    [remove],
  )

  return { mutate, pendingId, error }
}
