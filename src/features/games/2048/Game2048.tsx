import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatScore } from '../leaderboard'
import { useSwipeDirection } from '../useSwipeDirection'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import { Board2048 } from './Board2048'
import { WIN_TILE, highestTile, tileExponent } from './engine'
import { use2048Game } from './use2048Game'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-line-soft bg-surface px-3 py-2">
      <span className="text-xs text-ink-subtle">{label}</span>
      <span className="truncate text-lg font-semibold text-ink-body tabular-nums">
        {value}
      </span>
    </div>
  )
}

/**
 * 2048, som medlemmerne møder det: brættet, tallene, knapperne -- og turen fra
 * "ikke flere træk" til en linje på klubbens resultatliste.
 */
export function Game2048() {
  const { session } = useAuth()
  const userId = session?.user.id
  const controls = use2048Game()
  const { state } = controls
  const swipe = useSwipeDirection(controls.move)

  const personalBest = usePersonalBest('2048', userId)
  const submitScore = useSubmitScore('2048', userId)
  const submitted = useRef(false)
  const bestBeforeGame = useRef(0)
  const [record, setRecord] = useState(false)
  /** Vist én gang, når 2048 nås -- og kan lukkes, så man kan spille videre. */
  const [celebrating, setCelebrating] = useState(false)
  const celebrated = useRef(false)

  const biggest = highestTile(state.board)

  function startGame() {
    submitted.current = false
    celebrated.current = false
    setRecord(false)
    setCelebrating(false)
    bestBeforeGame.current = personalBest.data?.score ?? 0
    controls.start()
  }

  const saveResult = useCallback(() => {
    if (!userId || state.score <= 0) return
    submitScore.mutate({
      score: state.score,
      lines: state.moves,
      level: tileExponent(highestTile(state.board)),
      durationSeconds: Math.max(
        0,
        Math.round((Date.now() - controls.startedAt) / 1000),
      ),
    })
  }, [
    controls.startedAt,
    state.board,
    state.moves,
    state.score,
    submitScore,
    userId,
  ])

  // Resultatet sendes af sig selv, når der ikke er flere træk. Et spil, man
  // skal huske at gemme bagefter, er et spil, der ikke kommer på listen.
  // `submitted` sørger for, at det kun sker én gang.
  useEffect(() => {
    if (state.status !== 'over' || submitted.current) return
    submitted.current = true
    setRecord(state.score > bestBeforeGame.current)
    saveResult()
  }, [saveResult, state.score, state.status])

  useEffect(() => {
    if (!state.won || celebrated.current || state.status !== 'running') return
    celebrated.current = true
    setCelebrating(true)
  }, [state.status, state.won])

  const playing = state.status === 'running'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatTile label="Point" value={formatScore(state.score)} />
        <StatTile label="Største brik" value={String(biggest)} />
        <StatTile label="Træk" value={String(state.moves)} />
      </div>

      <div
        {...swipe}
        className="relative mx-auto w-full max-w-md"
        data-testid="board-2048"
      >
        <Board2048 state={state} />

        {(state.status !== 'running' || celebrating) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/65 p-4 text-center text-white">
            {state.status === 'idle' && (
              <>
                <p className="text-xl font-semibold">Klar?</p>
                <p className="max-w-xs text-sm text-white/80">
                  Skub brikkerne, så to ens mødes og bliver til én. Nå 2048 —
                  eller videre.
                </p>
              </>
            )}
            {state.status === 'running' && celebrating && (
              <>
                <p className="text-xl font-semibold">Du nåede {WIN_TILE}!</p>
                <p className="max-w-xs text-sm text-white/80">
                  Brættet er stadig dit. Spil videre, så længe der er træk.
                </p>
              </>
            )}
            {state.status === 'over' && (
              <>
                <p className="text-xl font-semibold">Ikke flere træk</p>
                <p className="text-sm text-white/80">
                  {formatScore(state.score)} point, største brik {biggest},{' '}
                  {state.moves} træk.
                </p>
                {record && state.score > 0 && (
                  <p className="text-sm font-medium text-warn-ring">
                    Ny personlig rekord!
                  </p>
                )}
                {submitScore.isPending && (
                  <p className="text-sm text-white/80">Gemmer resultatet…</p>
                )}
                {submitScore.isError && (
                  <button
                    type="button"
                    onClick={saveResult}
                    className="min-h-11 rounded-lg border border-white/60 px-4 py-2 text-sm"
                  >
                    Resultatet blev ikke gemt. Prøv igen
                  </button>
                )}
                {submitScore.isSuccess && (
                  <p className="text-sm text-white/80">
                    Resultatet er på listen.
                  </p>
                )}
              </>
            )}

            <button
              type="button"
              onClick={
                state.status === 'running'
                  ? () => setCelebrating(false)
                  : startGame
              }
              className="min-h-11 rounded-lg bg-white px-5 py-2 font-medium text-ink"
            >
              {state.status === 'idle' && 'Start spillet'}
              {state.status === 'running' && 'Spil videre'}
              {state.status === 'over' && 'Spil igen'}
            </button>
          </div>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center text-sm text-ink-subtle"
      >
        {state.status === 'over'
          ? `Spillet er slut med ${formatScore(state.score)} point.`
          : state.won
            ? `${WIN_TILE} er nået.`
            : ''}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={startGame}
          className="min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
        >
          {playing
            ? 'Nyt spil'
            : state.status === 'idle'
              ? 'Start'
              : 'Nyt spil'}
        </button>
        {personalBest.data && (
          <p className="text-sm text-ink-subtle">
            Din rekord: {formatScore(personalBest.data.score)} point
          </p>
        )}
      </div>

      {!userId && (
        <p className="text-center text-sm text-ink-subtle">
          Log ind for at få dit resultat på klubbens liste.
        </p>
      )}

      <details className="rounded-xl border border-line-soft bg-surface p-4 text-sm text-ink-muted">
        <summary className="cursor-pointer font-medium text-ink-body">
          Sådan spiller du
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p>
            På telefonen: stryg over brættet i den retning, brikkerne skal
            skubbes. På tastaturet gør piletasterne (eller W, A, S, D) det
            samme.
          </p>
          <p>
            Alle brikker glider til den side, du skubber mod. To ens brikker,
            der støder sammen, bliver til én med det dobbelte tal — og giver det
            tal i point. Efter hvert træk dukker en ny 2'er (eller sjældent en
            4'er) op et tomt sted.
          </p>
          <p>
            Spillet er slut, når brættet er fuldt, og ingen naboer er ens. Når
            2048 er lagt, må du gerne spille videre.
          </p>
        </div>
      </details>
    </div>
  )
}
