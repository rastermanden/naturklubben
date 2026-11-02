import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { StiGame } from '../features/games/sti/StiGame'

export default function StiPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">Stifinderen</h1>
      </div>

      <StiGame />

      <Leaderboard game="sti" heading="Resultatliste" />
      <RecentScores game="sti" />
    </div>
  )
}
