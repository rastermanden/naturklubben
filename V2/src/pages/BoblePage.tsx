import { Link } from 'react-router-dom'
import { BobleGame } from '../features/games/boble/BobleGame'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'

export default function BoblePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">Boble-spillet</h1>
        <p className="text-sm text-ink-subtle">
          Et lille arkadespil inspireret af Bubble Bobble. Fang modstanderne i
          bobler, og punkter dem for point.
        </p>
      </div>
      <BobleGame />
      <Leaderboard game="boble" heading="Resultatliste" />
      <RecentScores game="boble" />
    </main>
  )
}
