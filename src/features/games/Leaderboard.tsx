import { Avatar } from '../../components/Avatar'
import { useIsAdmin } from '../admin/useIsAdmin'
import { useAuth } from '../auth/useAuth'
import {
  formatDuration,
  formatScore,
  playerName,
  rankLeaderboard,
} from './leaderboard'
import type { GameId, GameScore } from './types'
import { useDeleteScore, useLeaderboard } from './useGameScores'

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** De tre øverste får et tegn med i stedet for et tal. */
const MEDALS = ['🥇', '🥈', '🥉'] as const

const AVATAR_COLOR = '#15803d'

function LeaderboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Henter resultatlisten"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface p-3"
        >
          <span className="h-7 w-7 shrink-0 rounded-full bg-surface-raised motion-safe:animate-pulse" />
          <span className="h-4 flex-1 rounded bg-surface-sunken motion-safe:animate-pulse" />
          <span className="h-4 w-16 rounded bg-surface-raised motion-safe:animate-pulse" />
        </div>
      ))}
      <span className="sr-only">Henter resultatlisten…</span>
    </div>
  )
}

interface LeaderboardProps {
  game: GameId
  /** Vis kun de øverste -- brugt på oversigten over spil. */
  limit?: number
  heading?: string
}

export function Leaderboard({ game, limit, heading }: LeaderboardProps) {
  const { session } = useAuth()
  const { isAdmin } = useIsAdmin()
  const leaderboard = useLeaderboard(game)
  const deleteScore = useDeleteScore(game)
  const userId = session?.user.id

  const entries = rankLeaderboard(leaderboard.data)
  const shown = limit ? entries.slice(0, limit) : entries

  function removeScore(score: GameScore) {
    const owner = score.player_id === userId
    const question = owner
      ? `Vil du slette dit resultat på ${formatScore(score.score)} point?`
      : `Vil du slette ${playerName(score)}s resultat på ${formatScore(score.score)} point?`
    if (!window.confirm(question)) return
    deleteScore.mutate(score.id)
  }

  return (
    <section className="flex flex-col gap-3">
      {heading && (
        <h2 className="text-xl font-semibold text-ink-body">{heading}</h2>
      )}

      {leaderboard.isPending && <LeaderboardSkeleton />}

      {leaderboard.isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-danger-line bg-danger-surface p-4 text-danger-strong sm:flex-row sm:items-center sm:justify-between"
        >
          <p>Resultatlisten kunne ikke hentes.</p>
          <button
            type="button"
            onClick={() => leaderboard.refetch()}
            className="min-h-11 rounded-lg border border-danger-line px-4 py-2 font-medium"
          >
            Prøv igen
          </button>
        </div>
      )}

      {leaderboard.isSuccess && entries.length === 0 && (
        <p className="rounded-xl border border-line-soft bg-surface px-4 py-8 text-center text-ink-subtle">
          Ingen har spillet endnu. Den første, der gør, står øverst.
        </p>
      )}

      {shown.length > 0 && (
        <ol className="flex flex-col gap-2">
          {shown.map(({ rank, score }) => {
            const own = score.player_id === userId
            const medal = MEDALS[rank - 1]
            return (
              <li
                key={score.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  own
                    ? 'border-line-strong bg-surface-sunken'
                    : 'border-line-soft bg-surface'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="w-8 shrink-0 text-center text-lg font-semibold text-ink-muted tabular-nums"
                >
                  {medal ?? rank}
                </span>
                <Avatar
                  name={playerName(score)}
                  avatarUrl={score.player?.avatar_url ?? null}
                  color={AVATAR_COLOR}
                  decorative
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-ink-body">
                    <span className="sr-only">Plads {rank}: </span>
                    {playerName(score)}
                    {own && (
                      <span className="ml-2 text-xs font-normal text-ink-subtle">
                        dig
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-ink-subtle">
                    {score.lines} rækker · niveau {score.level} ·{' '}
                    {formatDuration(score.duration_seconds)} ·{' '}
                    {dateFormatter.format(new Date(score.created_at))}
                  </span>
                </div>
                <span className="shrink-0 font-semibold text-ink-body tabular-nums">
                  {formatScore(score.score)}
                </span>
                {(own || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => removeScore(score)}
                    disabled={
                      deleteScore.isPending &&
                      deleteScore.variables === score.id
                    }
                    aria-label={`Slet resultatet på ${formatScore(score.score)} point`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-lg text-ink-subtle disabled:opacity-40"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {deleteScore.isError && (
        <p role="alert" className="text-sm text-danger">
          Resultatet kunne ikke slettes. Prøv igen.
        </p>
      )}
    </section>
  )
}
