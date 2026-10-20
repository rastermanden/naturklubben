import { gameById } from './games'
import { formatScore, playerName, rankLeaderboard } from './leaderboard'
import type { GameId, GameScore } from './types'
import { useDeleteScore, useLeaderboard, usePlayer } from './useGameScores'

/**
 * Klubbens resultatliste for ét spil.
 *
 * Siden er den samme som før, men data kommer fra Convex: `useLeaderboard`
 * abonnerer på queryen, så listen opdaterer sig selv, når nogen spiller -- der
 * er ingen `invalidateQueries` at huske. Rækkerne er de bedste point, ikke de
 * bedste pr. medlem; opdelingen og pladserne gør `rankLeaderboard`.
 */

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** De tre øverste får et tegn med i stedet for et tal. */
const MEDALS = ['🥇', '🥈', '🥉'] as const

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
  const me = usePlayer()
  const scores = useLeaderboard(game)
  const deleteScore = useDeleteScore()

  const entries = rankLeaderboard(scores)
  const shown = limit ? entries.slice(0, limit) : entries
  const myId = me?.profileId
  const isAdmin = me?.isAdmin ?? false

  function removeScore(score: GameScore) {
    const owner = score.playerId === myId
    const question = owner
      ? `Vil du slette dit resultat på ${formatScore(score.score)} point?`
      : `Vil du slette ${playerName(score)}s resultat på ${formatScore(score.score)} point?`
    if (!window.confirm(question)) return
    deleteScore.mutate(score._id)
  }

  return (
    <section className="flex flex-col gap-3">
      {heading && (
        <h2 className="text-xl font-semibold text-ink-body">{heading}</h2>
      )}

      {scores === undefined && <LeaderboardSkeleton />}

      {scores !== undefined && entries.length === 0 && (
        <p className="rounded-xl border border-line-soft bg-surface px-4 py-8 text-center text-ink-subtle">
          Ingen har spillet endnu. Den første, der gør, står øverst.
        </p>
      )}

      {shown.length > 0 && (
        <ol className="flex flex-col gap-2">
          {shown.map(({ rank, score }) => {
            const own = score.playerId === myId
            const medal = MEDALS[rank - 1]
            const canDelete = own || isAdmin
            return (
              <li
                key={score._id}
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
                    {gameById(game).describeScore(score)} ·{' '}
                    {dateFormatter.format(new Date(score.createdAt))}
                  </span>
                </div>
                <span className="shrink-0 font-semibold text-ink-body tabular-nums">
                  {formatScore(score.score)}
                </span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => removeScore(score)}
                    disabled={deleteScore.pendingId === score._id}
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

      {deleteScore.error && (
        <p role="alert" className="text-sm text-danger">
          Resultatet kunne ikke slettes. Prøv igen.
        </p>
      )}
    </section>
  )
}
