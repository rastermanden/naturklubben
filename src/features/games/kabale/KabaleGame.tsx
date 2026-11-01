import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatDuration, formatScore } from '../leaderboard'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import { KabaleTable } from './KabaleTable'
import { scoreFor, type DrawCount } from './engine'
import { useKabaleGame } from './useKabaleGame'

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
 * Teknisk forklaring på, hvorfor et resultat ikke blev gemt -- til brug under
 * preview-test, hvor en tom branch-database kan afvise indsættelsen. Supabase
 * kaster en PostgrestError med `code` og `message`. Vises småt under knappen,
 * så en rigtig fejl kan skelnes fra en, der forsvinder med et nyt forsøg.
 */
function describeSaveError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const { code, message } = error as { code?: unknown; message?: unknown }
  const text = typeof message === 'string' ? message : null
  const num = typeof code === 'string' ? code : null
  if (num && text) return `${num}: ${text}`
  return text ?? num
}

const CONFETTI = ['#fbbf24', '#b91c1c', '#ffffff', '#86efac', '#fdba74']

/**
 * 7-kabale, som medlemmerne møder den: bordet, trækene og tiden -- og turen
 * fra "du vandt" til en linje på klubbens resultatliste.
 */
export function KabaleGame() {
  const { session } = useAuth()
  const userId = session?.user.id
  const controls = useKabaleGame()
  const { state, drawCount, dispatch, newGame, elapsed, startedAt } = controls

  const personalBest = usePersonalBest('kabale', userId)
  const submitScore = useSubmitScore('kabale', userId)
  const submitted = useRef(false)
  const bestBeforeGame = useRef(0)
  const [result, setResult] = useState<{
    score: number
    seconds: number
    record: boolean
  } | null>(null)

  const won = state.status === 'won'
  const seconds = result?.seconds ?? elapsed
  const score =
    result?.score ?? scoreFor(state.points, state.drawCount, seconds)

  useEffect(() => {
    if (state.moves !== 0 || state.status !== 'playing') return
    bestBeforeGame.current = personalBest.data?.score ?? 0
  }, [personalBest.data, state.moves, state.status])

  function begin(count: DrawCount) {
    submitted.current = false
    setResult(null)
    bestBeforeGame.current = personalBest.data?.score ?? 0
    newGame(count)
  }

  function saveResult() {
    if (!userId || !result || result.score <= 0) return
    submitScore.mutate({
      score: result.score,
      lines: state.moves,
      level: state.drawCount,
      durationSeconds: result.seconds,
    })
  }

  // Resultatet sendes af sig selv, når sidste kort er hjemme. `submitted`
  // sørger for, at det kun sker én gang, også selv om effekten kører igen.
  useEffect(() => {
    if (!won || submitted.current) return
    submitted.current = true
    const finishedSeconds = Math.max(
      0,
      Math.round((Date.now() - startedAt) / 1000),
    )
    const finishedScore = scoreFor(
      state.points,
      state.drawCount,
      finishedSeconds,
    )
    setResult({
      score: finishedScore,
      seconds: finishedSeconds,
      record: finishedScore > bestBeforeGame.current,
    })
    if (!userId || finishedScore <= 0) return
    submitScore.mutate({
      score: finishedScore,
      lines: state.moves,
      level: state.drawCount,
      durationSeconds: finishedSeconds,
    })
  }, [
    startedAt,
    state.drawCount,
    state.moves,
    state.points,
    submitScore,
    userId,
    won,
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatTile
          label="Point"
          value={formatScore(won ? score : state.points)}
        />
        <StatTile label="Træk" value={String(state.moves)} />
        <StatTile label="Tid" value={formatDuration(seconds)} />
      </div>

      <div className="relative">
        <KabaleTable
          key={startedAt}
          state={state}
          onMove={(move) => dispatch({ type: 'move', move })}
          onDraw={() => dispatch({ type: 'draw' })}
          onFoundation={(from) => dispatch({ type: 'toFoundation', from })}
        />
        {won && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl bg-black/65 p-4 text-center text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              {CONFETTI.map((color, index) => (
                <span
                  key={color + index}
                  className="animate-kabale-confetti absolute top-0 h-2 w-2 rounded-sm"
                  style={{
                    left: `${8 + ((index * 17) % 84)}%`,
                    backgroundColor: color,
                    animationDelay: `${index * 70}ms`,
                  }}
                />
              ))}
            </div>
            <p className="text-xl font-semibold">Du vandt!</p>
            <p className="max-w-xs text-sm text-white/80">
              {formatScore(score)} point på {state.moves} træk og{' '}
              {formatDuration(seconds)}.
              {state.drawCount === 3 ? ' Træk 3.' : ' Træk 1.'}
            </p>
            {result?.record && score > 0 && (
              <p className="text-sm font-medium text-warn-ring">
                Ny personlig rekord!
              </p>
            )}
            {submitScore.isPending && (
              <p className="text-sm text-white/80">Gemmer resultatet…</p>
            )}
            {submitScore.isError && (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={saveResult}
                  className="min-h-11 rounded-lg border border-white/60 px-4 py-2 text-sm"
                >
                  Resultatet blev ikke gemt. Prøv igen
                </button>
                {describeSaveError(submitScore.error) && (
                  <p className="max-w-xs text-xs break-words text-white/70">
                    {describeSaveError(submitScore.error)}
                  </p>
                )}
              </div>
            )}
            {submitScore.isSuccess && (
              <p className="text-sm text-white/80">Resultatet er på listen.</p>
            )}
          </div>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center text-sm text-ink-subtle"
      >
        {won ? `Du vandt med ${formatScore(score)} point.` : ''}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => begin(drawCount)}
          className="min-h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover"
        >
          Nyt spil
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={state.history.length === 0 || won}
          className="min-h-11 rounded-lg border border-line bg-surface px-4 font-medium text-ink-body disabled:opacity-50"
        >
          Fortryd
        </button>
        <div
          role="group"
          aria-label="Hvor mange kort der trækkes fra bunken"
          className="flex overflow-hidden rounded-lg border border-line"
        >
          <ModeButton
            pressed={drawCount === 1}
            onClick={() => {
              if (drawCount !== 1) begin(1)
            }}
            label="1 kort"
          />
          <ModeButton
            pressed={drawCount === 3}
            onClick={() => {
              if (drawCount !== 3) begin(3)
            }}
            label="3 kort"
          />
        </div>
      </div>

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
            Syv rækker: den første har ét kort, den næste to, og sådan frem til
            syv. Kun det øverste kort i hver række ligger med forsiden opad.
            Resten ligger i bunken.
          </p>
          <p>
            Byg rækkerne nedad med skiftende farve. En sort 7 kan ligge på en
            rød 8, og kun en konge må ligge på en tom række. Grundbunkerne
            bygges op i samme kulør, fra es til konge.
          </p>
          <p>
            Tryk på bunken for at trække et kort — eller tre, hvis du har valgt
            det. Tryk på et kort og derefter på det sted, det skal hen, eller
            træk det derhen. Tryk to gange på et kort for at lægge det hjem,
            hvis det passer. Når alle kort ligger med forsiden opad, lægges
            resten hjem af sig selv, hvis det kan gøres.
          </p>
          <p>
            Fortryd tager det sidste træk tilbage. Pointene tæller kort, der
            vendes og lægges hjem. Et hurtigt parti giver et tillæg, og træk 3
            giver et ekstra, fordi det er sværere. Kun et vundet parti kommer på
            listen.
          </p>
        </div>
      </details>
    </div>
  )
}

function ModeButton({
  pressed,
  onClick,
  label,
}: {
  pressed: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 px-3 text-sm font-medium ${
        pressed ? 'bg-accent text-white' : 'bg-surface text-ink-body'
      }`}
    >
      {label}
    </button>
  )
}
