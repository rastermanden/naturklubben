import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatScore } from '../leaderboard'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import {
  CLASS_CONTROLS,
  CLASS_MAX_SCORE,
  classTitle,
  directionTo,
  statusLine,
  type CourseClass,
} from './engine'
import { MapView, TerrainLegend } from './MapView'
import { useStiGame } from './useStiGame'

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

/**
 * Stifinderen, som medlemmerne møder det: kortet, posterne og terræntiden --
 * og turen fra "banen er klaret" til en linje på klubbens resultatliste.
 */
export function StiGame() {
  const { session } = useAuth()
  const userId = session?.user.id
  const controls = useStiGame()
  const { state, dispatch } = controls

  const personalBest = usePersonalBest('sti', userId)
  const submitScore = useSubmitScore('sti', userId)
  const submitted = useRef(false)
  const bestBeforeGame = useRef(0)
  const [record, setRecord] = useState(false)

  function begin(level: CourseClass) {
    submitted.current = false
    setRecord(false)
    bestBeforeGame.current = personalBest.data?.score ?? 0
    controls.start(level)
  }

  const saveResult = useCallback(() => {
    if (!userId || state.outcome !== 'finished' || state.score <= 0) return
    submitScore.mutate({
      score: state.score,
      lines: state.controls.length,
      level: state.level,
      durationSeconds: state.elapsed,
    })
  }, [state, submitScore, userId])

  // Resultatet sendes af sig selv, når sidste post er taget. En bane, man
  // skal huske at gemme bagefter, er en bane, der ikke kommer på listen.
  useEffect(() => {
    if (
      state.status !== 'over' ||
      state.outcome !== 'finished' ||
      submitted.current
    ) {
      return
    }
    submitted.current = true
    setRecord(state.score > bestBeforeGame.current)
    saveResult()
  }, [saveResult, state.outcome, state.score, state.status])

  const running = state.status === 'running'
  const next = state.controls[state.nextIndex]
  const point = running && next ? (directionTo(state, next)?.point ?? '–') : '–'
  const idle = state.status === 'idle'
  const post = idle ? '–' : `${state.nextIndex} / ${state.controls.length}`
  const terrainTime = idle ? '–' : String(state.elapsed)
  const course = idle ? '–' : classTitle(state.level)
  const steps = idle ? '–' : String(state.steps)
  const perfect =
    state.outcome === 'finished' && state.score === CLASS_MAX_SCORE[state.level]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatTile label="Post" value={post} />
        <StatTile label="Terræn" value={terrainTime} />
        <StatTile label="Bane" value={course} />
        <StatTile label="Skridt" value={steps} />
      </div>

      <div className="overflow-hidden rounded-xl border border-line-soft bg-surface">
        <div className="relative">
          <div aria-hidden={state.status !== 'running'}>
            <MapView state={state} />
          </div>
          {state.status !== 'running' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto bg-black/65 p-4 text-center text-white">
              {state.status === 'idle' && (
                <>
                  <p className="text-xl font-semibold">Vælg en bane</p>
                  <p className="max-w-sm text-sm text-white/80">
                    Gå posterne i nummerorden. Sti er hurtig, mose er langsom,
                    og den hurtigste rute giver flest point.
                  </p>
                </>
              )}
              {state.outcome === 'finished' && (
                <>
                  <p className="text-xl font-semibold">Banen er klaret</p>
                  <p className="text-sm text-white/80">
                    {formatScore(state.score)} point på{' '}
                    {classTitle(state.level).toLowerCase()} bane. Terræntid{' '}
                    {state.elapsed}.
                  </p>
                  {perfect && (
                    <p className="text-sm text-white/80">Hurtigste rute.</p>
                  )}
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
              {state.outcome === 'retired' && (
                <>
                  <p className="text-xl font-semibold">Du gav op</p>
                  <p className="max-w-sm text-sm text-white/80">
                    Banen tæller ikke med på listen.
                  </p>
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
                    {classTitle(level)} · {CLASS_CONTROLS[level]} poster
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-line-soft px-3 py-2">
          <TerrainLegend />
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center text-sm text-ink-subtle"
      >
        {running
          ? (state.notice ?? statusLine(state))
          : state.outcome === 'finished'
            ? `Banen er klaret med ${formatScore(state.score)} point.`
            : state.outcome === 'retired'
              ? 'Du gav op.'
              : ''}
      </p>

      <Pad
        disabled={!running}
        point={point}
        onMove={(dx, dy) => dispatch({ type: 'move', dx, dy })}
      />

      {running && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'retire' })}
          className="self-center text-sm text-ink-muted underline"
        >
          Giv op
        </button>
      )}

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
            Posterne er de lilla cirkler. Tag dem i nummerorden. Går du hen over
            en senere post, tæller den ikke endnu.
          </p>
          <p>
            Hvert felt koster terræntid: sti 1, eng 2, skov 3, krat 5, mose 8.
            Vand må du gå udenom. Træk i kortet, hvis banen er større end
            vinduet. Nord er opad.
          </p>
          <p>
            Styres med knapperne, piletasterne eller WASD. Pointene følger, hvor
            tæt terræntiden er på den hurtigste rute. 1.200, 3.600 og 6.000 er
            loftet for let, mellemsvær og svær. Uret på væggen tæller ikke.
            Tiden på listen er terræntiden.
          </p>
        </div>
      </details>
    </div>
  )
}

function Pad({
  disabled,
  point,
  onMove,
}: {
  disabled: boolean
  point: string
  onMove: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void
}) {
  const button =
    'flex h-14 select-none items-center justify-center rounded-xl border border-line-strong bg-surface text-xl text-ink-body touch-manipulation active:bg-surface-raised disabled:opacity-40'
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
      <span />
      <button
        type="button"
        aria-label="Gå mod nord"
        disabled={disabled}
        onClick={() => onMove(0, -1)}
        className={button}
      >
        <span aria-hidden="true">↑</span>
      </button>
      <span />
      <button
        type="button"
        aria-label="Gå mod vest"
        disabled={disabled}
        onClick={() => onMove(-1, 0)}
        className={button}
      >
        <span aria-hidden="true" className="inline-block -rotate-90">
          ↑
        </span>
      </button>
      <div
        aria-hidden="true"
        className="flex items-center justify-center text-sm font-semibold text-ink-subtle"
      >
        {point}
      </div>
      <button
        type="button"
        aria-label="Gå mod øst"
        disabled={disabled}
        onClick={() => onMove(1, 0)}
        className={button}
      >
        <span aria-hidden="true" className="inline-block rotate-90">
          ↑
        </span>
      </button>
      <span />
      <button
        type="button"
        aria-label="Gå mod syd"
        disabled={disabled}
        onClick={() => onMove(0, 1)}
        className={button}
      >
        <span aria-hidden="true" className="inline-block rotate-180">
          ↑
        </span>
      </button>
      <span />
    </div>
  )
}
