import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { Game2048 } from '../features/games/2048/Game2048'

export default function TwentyFortyEightPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">2048</h1>
      </div>

      <Game2048 />

      <Leaderboard game="2048" heading="Resultatliste" />
      <RecentScores game="2048" />
    </div>
  )
}
