import { useCallback, useEffect, useRef, useState } from 'react'
import {
  QUESTION_TIME_LIMIT_MS,
  answerQuestion,
  createGame,
  currentQuestion,
  nextQuestion,
  startGame,
  type NaturquizState,
} from './engine'

export interface NaturquizControls {
  state: NaturquizState
  /** Millisekunder tilbage af det spørgsmål, der venter på svar. */
  remainingMs: number
  start: () => void
  answer: (choiceId: string) => void
  next: () => void
  /** Hvornår runden begyndte -- til varigheden på resultatlisten. */
  startedAt: number
}

/** Hvor ofte nedtællingen opdateres. Hyppigt nok til at føles levende, uden
 *  at genrendere brættet i hver browsers frame. */
const TICK_MS = 200

/**
 * Spillets forbindelse til browseren: uret, der tæller ned pr. spørgsmål, og
 * omsætningen af et klik til et svar med den rigtige svartid. Reglerne ligger
 * i `engine.ts` og ved intet om nogen af delene.
 */
export function useNaturquizGame(): NaturquizControls {
  const [state, setState] = useState<NaturquizState>(createGame)
  const [startedAt, setStartedAt] = useState(0)
  const [remainingMs, setRemainingMs] = useState(QUESTION_TIME_LIMIT_MS)
  const questionStartedAt = useRef(0)
  const answered = useRef(false)

  const answer = useCallback((choiceId: string | null) => {
    if (answered.current) return
    answered.current = true
    const elapsedMs = Date.now() - questionStartedAt.current
    setState((prev) => answerQuestion(prev, choiceId, elapsedMs))
  }, [])

  const start = useCallback(() => {
    setStartedAt(Date.now())
    questionStartedAt.current = Date.now()
    answered.current = false
    setRemainingMs(QUESTION_TIME_LIMIT_MS)
    setState(startGame(Math.random))
  }, [])

  const next = useCallback(() => {
    questionStartedAt.current = Date.now()
    answered.current = false
    setRemainingMs(QUESTION_TIME_LIMIT_MS)
    setState((prev) => nextQuestion(prev))
  }, [])

  // Nedtællingen tikker, mens et spørgsmål venter på svar, og svarer selv
  // "intet" for spilleren, når tiden er brugt op -- akkurat som en, der ikke
  // nåede at trykke. Uret går ikke, mens fanen er skjult, så man ikke kommer
  // tilbage til et spørgsmål, der er udløbet bag ens ryg (samme mønster som
  // indsejlingen i Kaptajn Kaper).
  const waitingForAnswer =
    state.status === 'running' &&
    state.lastResult === null &&
    currentQuestion(state) !== null
  useEffect(() => {
    if (!waitingForAnswer) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const elapsed = Date.now() - questionStartedAt.current
      const remaining = Math.max(0, QUESTION_TIME_LIMIT_MS - elapsed)
      setRemainingMs(remaining)
      if (remaining <= 0) answer(null)
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [answer, waitingForAnswer])

  return {
    state,
    remainingMs,
    start,
    answer: (id: string) => answer(id),
    next,
    startedAt,
  }
}
