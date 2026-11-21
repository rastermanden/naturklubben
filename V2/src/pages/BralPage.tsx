import { Link } from 'react-router-dom'
import { BralGame } from '../features/games/bral/BralGame'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'

export default function BralPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:gap-8 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-2xl font-semibold text-ink-body">Bral smeltning</h1>
        <p className="text-sm text-ink-subtle">
          Smelt tomme øldåser om til klubbens egen valuta. Fire dåser giver
          metal til én Bral-mønt.
        </p>
      </div>
      <BralGame />
      <Leaderboard game="bral" heading="Resultatliste" />
      <RecentScores game="bral" />
    </main>
  )
}
