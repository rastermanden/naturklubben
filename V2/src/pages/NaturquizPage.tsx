import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { NaturquizGame } from '../features/games/naturquiz/NaturquizGame'

export default function NaturquizPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">Naturquiz</h1>
      </div>

      <NaturquizGame />

      <Leaderboard game="naturquiz" heading="Resultatliste" />
      <RecentScores game="naturquiz" />
    </div>
  )
}
