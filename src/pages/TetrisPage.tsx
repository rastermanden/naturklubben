import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { TetrisGame } from '../features/games/tetris/TetrisGame'

function TetrisPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">Tetris</h1>
      </div>

      <TetrisGame />

      <Leaderboard game="tetris" heading="Resultatliste" />
      <RecentScores game="tetris" />
    </main>
  )
}

export default TetrisPage
