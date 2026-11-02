import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { KabaleGame } from '../features/games/kabale/KabaleGame'

export default function KabalePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">7-kabale</h1>
      </div>

      <KabaleGame />

      <Leaderboard game="kabale" heading="Resultatliste" />
      <RecentScores game="kabale" />
    </div>
  )
}
