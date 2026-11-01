import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'
import { KabaleGame } from '../features/games/kabale/KabaleGame'

function KabalePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">7-kabale</h1>
      </div>

      <KabaleGame />

      <Leaderboard game="kabale" heading="Resultatliste" />
      <RecentScores game="kabale" />
    </main>
  )
}

export default KabalePage
