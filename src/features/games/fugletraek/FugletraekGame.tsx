import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatDuration, formatScore } from '../leaderboard'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import {
  CLASS_MAX_SCORE,
  CLASS_PAIRS,
  classTitle,
  isFaceUp,
  scoreFor,
  type GameClass,
} from './engine'
import { useFugletraekGame } from './useFugletraekGame'

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

const CLASSES = [1, 2, 3] as const

/** Antal kolonner, så brættet står pænt i begge temaer og på en telefon. */
const COLUMNS: Record<GameClass, number> = { 1: 3, 2: 4, 3: 4 }

/**
 * Fugletræk, som medlemmerne møder det: kortene, vendingerne og tiden -- og
 * turen fra "brættet er klaret" til en linje på klubbens resultatliste.
 */
export function FugletraekGame() {
  const { session } = useAuth()
  const userId = session?.user.id
  const controls = useFugletraekGame()
  const { state, dispatch, elapsed } = controls

  const personalBest = usePersonalBest('fugletraek', userId)
  const submitScore = useSubmitScore('fugletraek', userId)
  const submitted = useRef(false)
  const bestBeforeGame = useRef(0)
  const [record, setRecord] = useState(false)

  const won = state.status === 'over'
  const score = won ? scoreFor(state.level, state.flips, elapsed) : 0

  function begin(level: GameClass) {
    submitted.current = false
    setRecord(false)
    bestBeforeGame.current = personalBest.data?.score ?? 0
    controls.start(level)
  }

  const saveResult = useCallback(() => {
    if (!userId || !won || score <= 0) return
    submitScore.mutate({
      score,
      lines: state.flips,
      level: state.level,
      durationSeconds: elapsed,
    })
  }, [userId, won, score, submitScore, state.flips, state.level, elapsed])

  // Resultatet sendes af sig selv, når sidste par er fundet.
  useEffect(() => {
    if (!won || submitted.current) return
    submitted.current = true
    setRecord(score > bestBeforeGame.current)
    saveResult()
  }, [won, score, saveResult])

  const idle = state.status === 'idle'
  const columns = COLUMNS[state.level]
  const perfect = won && score === CLASS_MAX_SCORE[state.level]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatTile
          label="Par"
          value={
            idle ? '–' : `${state.matchedPairs} / ${CLASS_PAIRS[state.level]}`
          }
        />
        <StatTile label="Vendinger" value={idle ? '–' : String(state.flips)} />
        <StatTile label="Klasse" value={idle ? '–' : classTitle(state.level)} />
        <StatTile label="Tid" value={idle ? '–' : formatDuration(elapsed)} />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line-soft bg-surface p-3">
        <div
          aria-hidden={state.status !== 'running'}
          role="group"
          aria-label="Fugletræk-bræt"
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {state.cards.map((card, index) => {
            const faceUp = isFaceUp(state, index)
            return (
              <button
                key={card.id}
                type="button"
                disabled={state.status !== 'running' || card.matched}
                aria-pressed={faceUp}
                aria-label={
                  faceUp
                    ? `${card.name}${card.matched ? ', fundet' : ''}`
                    : `Skjult kort ${index + 1}`
                }
                onClick={() => dispatch({ type: 'flip', index })}
                className={`flex aspect-square items-center justify-center rounded-lg border text-3xl transition-colors ${
                  faceUp
                    ? card.matched
                      ? 'border-accent bg-surface-strong'
                      : 'border-line-strong bg-surface-raised'
                    : 'border-line-strong bg-surface-sunken text-transparent'
                }`}
              >
                <span aria-hidden="true">{faceUp ? card.symbol : '🌲'}</span>
              </button>
            )
          })}
        </div>

        {state.status !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto bg-black/65 p-4 text-center text-white">
            {idle && (
              <>
                <p className="text-xl font-semibold">Vælg et bræt</p>
                <p className="max-w-sm text-sm text-white/80">
                  Vend to kort ad gangen og find parrene. Færre vendinger og
                  kortere tid giver flest point.
                </p>
              </>
            )}
            {won && (
              <>
                <p className="text-xl font-semibold">Brættet er klaret</p>
                <p className="text-sm text-white/80">
                  {formatScore(score)} point på{' '}
                  {classTitle(state.level).toLowerCase()} bræt. {state.flips}{' '}
                  vendinger på {formatDuration(elapsed)}.
                </p>
                {perfect && (
                  <p className="text-sm text-white/80">Fejlfrit parti.</p>
                )}
                {record && score > 0 && (
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
            <div className="flex w-full max-w-xs flex-col gap-2">
              {CLASSES.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => begin(level)}
                  className="min-h-11 rounded-lg bg-white px-4 font-medium text-ink-fixed"
                >
                  {classTitle(level)} · {CLASS_PAIRS[level]} par
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center text-sm text-ink-subtle"
      >
        {won
          ? `Brættet er klaret med ${formatScore(score)} point.`
          : state.status === 'running'
            ? `Par fundet: ${state.matchedPairs} af ${CLASS_PAIRS[state.level]}.`
            : ''}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
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
            Kortene ligger med bagsiden opad. Vend to ad gangen: to ens dyr
            bliver liggende, to forskellige vendes tilbage. Find alle parrene
            for at klare brættet.
          </p>
          <p>
            En vending er to kort. Færrest mulige vendinger er antallet af par.
            Pointene følger, hvor få vendinger du bruger, og hvor hurtigt det
            går. 1.200, 3.600 og 6.000 er loftet for let, mellemsvær og svær.
          </p>
          <p>
            Styres med fingeren eller tastaturet: gå til et kort med Tab, og
            vend det med Enter eller mellemrum.
          </p>
        </div>
      </details>
    </div>
  )
}
