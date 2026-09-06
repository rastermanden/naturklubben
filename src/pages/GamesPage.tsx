import { Link } from 'react-router-dom'
import { Leaderboard } from '../features/games/Leaderboard'
import { games } from '../features/games/games'

/**
 * Spil-sektionens forside. Den findes, fordi der kommer flere spil end Tetris:
 * her er indgangen til dem, og et kig på, hvem der fører lige nu.
 */
function GamesPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-ink-body">Spil</h1>
        <p className="text-ink-subtle">
          Lidt at give sig til, når regnen sætter ind. Dit bedste resultat ryger
          på klubbens liste — og kan slås af de andre.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              to={game.path}
              className="flex items-center gap-4 rounded-xl border border-line-soft bg-surface p-4 hover:bg-surface-sunken"
            >
              <span aria-hidden="true" className="text-3xl">
                {game.symbol}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink-body">{game.title}</span>
                <span className="text-sm text-ink-subtle">{game.tagline}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <Leaderboard game="tetris" limit={5} heading="Tetris — de bedste" />
        <Link
          to="/spil/tetris"
          className="self-start text-sm text-ink-muted underline"
        >
          Se hele listen og spil
        </Link>
      </div>
    </main>
  )
}

export default GamesPage
