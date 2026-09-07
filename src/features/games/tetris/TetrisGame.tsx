import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatDuration, formatScore } from '../leaderboard'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import { describeClear } from './announce'
import { NEXT_COUNT } from './engine'
import { PiecePreview } from './PiecePreview'
import { TetrisBoard } from './TetrisBoard'
import { TouchControls } from './TouchControls'
import { useTetrisGame } from './useTetrisGame'
import { useTouchGestures } from './useTouchGestures'

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
 * Tetris, som medlemmerne møder det: brættet, tallene, knapperne -- og turen
 * fra "spillet er slut" til en linje på klubbens resultatliste.
 */
export function TetrisGame() {
  const { session } = useAuth()
  const userId = session?.user.id
  const controls = useTetrisGame()
  const { state } = controls
  const gestures = useTouchGestures(controls)

  const personalBest = usePersonalBest('tetris', userId)
  const submitScore = useSubmitScore('tetris', userId)
  const submitted = useRef(false)
  const bestBeforeGame = useRef(0)
  const [record, setRecord] = useState(false)

  const seconds = Math.round(state.elapsedMs / 1000)

  function startGame() {
    submitted.current = false
    setRecord(false)
    bestBeforeGame.current = personalBest.data?.score ?? 0
    controls.start()
  }

  const saveResult = useCallback(() => {
    if (!userId || state.score <= 0) return
    submitScore.mutate({
      score: state.score,
      lines: state.lines,
      level: state.level,
      durationSeconds: seconds,
    })
  }, [seconds, state.level, state.lines, state.score, submitScore, userId])

  // Resultatet sendes af sig selv, når spillet er slut. Et spil, man skal huske
  // at gemme bagefter, er et spil, der ikke kommer på listen. `submitted`
  // sørger for, at det kun sker én gang -- effekten køres også, hvis noget
  // andet omkring den ændrer sig bagefter.
  useEffect(() => {
    if (state.status !== 'over' || submitted.current) return
    submitted.current = true
    setRecord(state.score > bestBeforeGame.current)
    saveResult()
  }, [saveResult, state.score, state.status])

  const message = state.lastEvent ? describeClear(state.lastEvent) : ''
  const playing = state.status === 'running'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatTile label="Point" value={formatScore(state.score)} />
        <StatTile label="Rækker" value={String(state.lines)} />
        <StatTile label="Niveau" value={String(state.level)} />
        <StatTile label="Tid" value={formatDuration(seconds)} />
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
        <div
          {...gestures}
          className="relative aspect-[1/2] h-[56svh] max-h-[70vh] min-h-64 shrink-0"
        >
          <TetrisBoard state={state} />

          {state.status !== 'running' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/65 p-4 text-center text-white">
              {state.status === 'idle' && (
                <>
                  <p className="text-xl font-semibold">Klar?</p>
                  <p className="max-w-xs text-sm text-white/80">
                    Fyld rækkerne ud, så forsvinder de. Fire på én gang er en
                    Tetris.
                  </p>
                </>
              )}
              {state.status === 'paused' && (
                <p className="text-xl font-semibold">Pause</p>
              )}
              {state.status === 'over' && (
                <>
                  <p className="text-xl font-semibold">Spillet er slut</p>
                  <p className="text-sm text-white/80">
                    {formatScore(state.score)} point, {state.lines} rækker,
                    niveau {state.level}.
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
                  state.status === 'paused' ? controls.togglePause : startGame
                }
                className="min-h-11 rounded-lg bg-white px-5 py-2 font-medium text-ink"
              >
                {state.status === 'idle' && 'Start spillet'}
                {state.status === 'paused' && 'Fortsæt'}
                {state.status === 'over' && 'Spil igen'}
              </button>
            </div>
          )}
        </div>

        <div className="flex w-full max-w-md flex-col gap-4 sm:w-auto">
          <div className="flex items-start justify-center gap-3 sm:flex-col sm:items-center">
            <PiecePreview
              piece={state.hold}
              label="Gemt"
              dimmed={state.holdUsed}
            />
            <div className="flex items-start gap-2 sm:flex-col">
              {Array.from({ length: NEXT_COUNT }, (_, index) => (
                <PiecePreview
                  key={index}
                  piece={state.next[index] ?? null}
                  label={index === 0 ? 'Næste' : `+${index + 1}`}
                  size="small"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center text-sm text-ink-subtle"
      >
        {state.status === 'over'
          ? `Spillet er slut med ${formatScore(state.score)} point.`
          : message}
      </p>

      <div className="mx-auto w-full max-w-md">
        <TouchControls controls={controls} disabled={!playing} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={playing ? controls.togglePause : startGame}
          className="min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
        >
          {playing ? 'Pause' : state.status === 'idle' ? 'Start' : 'Nyt spil'}
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
            På telefonen: træk til siden for at flytte brikken, træk nedad for
            at sænke den, træk langt nedad for at smide den — og tryk på brættet
            for at dreje. Knapperne under brættet gør det samme.
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <strong className="text-ink-body">← →</strong> flyt ·{' '}
              <strong className="text-ink-body">↓</strong> sænk ·{' '}
              <strong className="text-ink-body">mellemrum</strong> smid ned
            </li>
            <li>
              <strong className="text-ink-body">↑ eller X</strong> drej med uret
              · <strong className="text-ink-body">Z</strong> drej mod uret
            </li>
            <li>
              <strong className="text-ink-body">C</strong> gem brikken til
              senere · <strong className="text-ink-body">P</strong> pause
            </li>
          </ul>
          <p>
            Fire rækker på én gang giver mest, og to svære rydninger i træk
            giver 50 % oveni. Niveauet — og farten — stiger for hver tiende
            række.
          </p>
        </div>
      </details>
    </div>
  )
}
