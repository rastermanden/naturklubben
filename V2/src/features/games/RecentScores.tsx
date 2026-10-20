import { formatScore, playerName } from './leaderboard'
import { formatRelativeTime } from './relativeTime'
import type { GameId } from './types'
import { useRecentScores } from './useGameScores'

/**
 * "Seneste spil" er der, fordi en resultatliste alene er en mur: den viser kun
 * de bedste og siger intet om, hvorvidt nogen overhovedet spiller. Et par
 * friske spil gør klubben synlig -- også for den, der lige er blevet slået.
 */
export function RecentScores({ game }: { game: GameId }) {
  const recent = useRecentScores(game)

  if (!recent || recent.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-ink-body">Seneste spil</h2>
      <ul className="flex flex-col gap-1">
        {recent.map((score) => (
          <li
            key={score._id}
            className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2 text-sm last:border-b-0"
          >
            <span className="truncate text-ink-body">{playerName(score)}</span>
            <span className="flex shrink-0 items-baseline gap-3 text-ink-subtle">
              <span className="tabular-nums">{formatScore(score.score)}</span>
              <time
                dateTime={new Date(score.createdAt).toISOString()}
                className="tabular-nums"
              >
                {formatRelativeTime(score.createdAt)}
              </time>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
