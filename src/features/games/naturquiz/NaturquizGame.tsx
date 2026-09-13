import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatScore } from '../leaderboard'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import {
  QUESTIONS_PER_ROUND,
  QUESTION_TIME_LIMIT_MS,
  currentQuestion,
} from './engine'
import { Sources } from './Sources'
import { useNaturquizGame } from './useNaturquizGame'

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
 * Naturquiz, som medlemmerne møder det: ét billede ad gangen, fire
 * svarknapper -- og turen fra "ikke flere spørgsmål" til en linje på
 * klubbens resultatliste. Reglerne ligger i `engine.ts`; her omsættes de til
 * skærmen.
 */
export function NaturquizGame() {
  const { session } = useAuth()
  const userId = session?.user.id
  const controls = useNaturquizGame()
  const { state } = controls

  const personalBest = usePersonalBest('naturquiz', userId)
  const submitScore = useSubmitScore('naturquiz', userId)
  const submitted = useRef(false)
  const [record, setRecord] = useState(false)

  const question = currentQuestion(state)
  const answered = state.lastResult !== null

  function startGame() {
    submitted.current = false
    setRecord(false)
    controls.start()
  }

  const saveResult = () => {
    if (!userId || state.score <= 0) return
    submitScore.mutate({
      score: state.score,
      lines: state.correctCount,
      durationSeconds: Math.max(
        0,
        Math.round((Date.now() - controls.startedAt) / 1000),
      ),
    })
  }

  // Resultatet gemmes af sig selv, når runden er slut -- som i de andre spil.
  useEffect(() => {
    if (state.status !== 'over' || submitted.current) return
    submitted.current = true
    setRecord(state.score > (personalBest.data?.score ?? 0))
    saveResult()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  const secondsLeft = Math.ceil(controls.remainingMs / 1000)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatTile label="Point" value={formatScore(state.score)} />
        <StatTile
          label="Spørgsmål"
          value={
            state.status === 'running'
              ? `${Math.min(state.index + 1, QUESTIONS_PER_ROUND)} / ${QUESTIONS_PER_ROUND}`
              : `- / ${QUESTIONS_PER_ROUND}`
          }
        />
        <StatTile label="Streak" value={String(state.streak)} />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        {state.status === 'idle' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line-soft bg-surface p-6 text-center">
            <p className="text-xl font-semibold text-ink-body">
              Klar til naturquiz?
            </p>
            <p className="max-w-xs text-sm text-ink-subtle">
              {QUESTIONS_PER_ROUND} billeder af fugle, planter og spor. Genkend
              arten blandt fire muligheder -- jo hurtigere du svarer, og jo
              flere rigtige i træk, jo flere point.
            </p>
            <button
              type="button"
              onClick={startGame}
              className="min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
            >
              Start quizzen
            </button>
          </div>
        )}

        {state.status === 'running' && question && (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-line-soft bg-surface-sunken">
              <img
                key={question.species.id}
                src={question.species.image.url}
                alt={question.species.image.alt}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </div>

            {!answered && (
              <p
                className="text-center text-sm text-ink-subtle"
                aria-hidden="true"
              >
                {secondsLeft} sek. tilbage
              </p>
            )}

            <div
              role="group"
              aria-label="Svarmuligheder"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {question.options.map((option) => {
                const isCorrect = option.id === question.correctId
                const isChosen = state.lastResult?.choiceId === option.id
                const style = !answered
                  ? 'border-line-strong bg-surface text-ink-body hover:bg-surface-sunken'
                  : isCorrect
                    ? 'border-success-ring bg-success-surface text-success-strong'
                    : isChosen
                      ? 'border-danger-ring bg-danger-surface text-danger-strong'
                      : 'border-line-soft bg-surface text-ink-subtle'
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={answered}
                    onClick={() => controls.answer(option.id)}
                    className={`min-h-11 rounded-lg border px-4 py-3 text-left font-medium disabled:cursor-default ${style}`}
                  >
                    {option.name}
                  </button>
                )
              })}
            </div>

            <p
              role="status"
              aria-live="polite"
              className="min-h-6 text-center text-sm"
            >
              {state.lastResult &&
                (state.lastResult.correct
                  ? `Rigtigt! +${state.lastResult.points} point.`
                  : `Forkert. Det rigtige svar var ${question.species.name}.`)}
            </p>

            {answered && (
              <button
                type="button"
                onClick={controls.next}
                className="min-h-11 self-center rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
              >
                {state.index + 1 >= QUESTIONS_PER_ROUND
                  ? 'Se resultatet'
                  : 'Næste spørgsmål'}
              </button>
            )}
          </div>
        )}

        {state.status === 'over' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line-soft bg-surface p-6 text-center">
            <p className="text-xl font-semibold text-ink-body">
              Runden er slut
            </p>
            <p className="text-sm text-ink-subtle">
              {formatScore(state.score)} point -- {state.correctCount} af{' '}
              {QUESTIONS_PER_ROUND} rigtige, længste streak {state.maxStreak}.
            </p>
            {record && state.score > 0 && (
              <p className="text-sm font-medium text-warn-ring">
                Ny personlig rekord!
              </p>
            )}
            {submitScore.isPending && (
              <p className="text-sm text-ink-subtle">Gemmer resultatet…</p>
            )}
            {submitScore.isError && (
              <button
                type="button"
                onClick={saveResult}
                className="min-h-11 rounded-lg border border-line-strong px-4 py-2 text-sm"
              >
                Resultatet blev ikke gemt. Prøv igen
              </button>
            )}
            {submitScore.isSuccess && (
              <p className="text-sm text-ink-subtle">
                Resultatet er på listen.
              </p>
            )}
            <button
              type="button"
              onClick={startGame}
              className="min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
            >
              Spil igen
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.status === 'idle' && personalBest.data && (
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
            Hver runde er {QUESTIONS_PER_ROUND} billeder af fugle, planter og
            spor. Vælg den rigtige art blandt fire muligheder -- med musen,
            fingeren eller tastaturet.
          </p>
          <p>
            Et rigtigt svar giver point med det samme, og en hastighedsbonus,
            hvis du svarer hurtigt. Flere rigtige svar i træk giver desuden en
            voksende streak-bonus -- men ét forkert svar nulstiller stregen.
            Svarer du ikke i tide ({Math.round(QUESTION_TIME_LIMIT_MS / 1000)}{' '}
            sekunder), tæller det som forkert.
          </p>
        </div>
      </details>

      <Sources />
    </div>
  )
}
