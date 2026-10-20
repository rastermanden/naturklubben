import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { KaperGame } from '../features/games/kaper/KaperGame'

export default function KaperPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">
          Kaptajn Kaper i Kattegat
        </h1>
      </div>

      <KaperGame />

      <Leaderboard game="kaper" heading="Resultatliste" />
      <RecentScores game="kaper" />
    </div>
  )
}
