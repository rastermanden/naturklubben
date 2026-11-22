import { Link } from 'react-router-dom'
import { BralGame } from '../features/games/bral/BralGame'
import { Leaderboard } from '../features/games/Leaderboard'
import { RecentScores } from '../features/games/RecentScores'

export default function BralPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-3 pt-2 pb-5 sm:gap-8 sm:p-6">
      <div className="flex flex-col gap-0.5 sm:gap-1">
        <Link to="/spil" className="text-sm text-ink-muted underline">
          ← Spil
        </Link>
        <h1 className="text-xl font-semibold text-ink-body sm:text-2xl">
          Bral smeltning
        </h1>
        <p className="text-xs text-ink-subtle sm:text-sm">
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
