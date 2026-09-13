import { Link } from 'react-router-dom'
import { Game2048 } from '../features/games/2048/Game2048'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'

function TwentyFortyEightPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">2048</h1>
      </div>

      <Game2048 />

      <Leaderboard game="2048" heading="Resultatliste" />
      <RecentScores game="2048" />
    </main>
  )
}

export default TwentyFortyEightPage
