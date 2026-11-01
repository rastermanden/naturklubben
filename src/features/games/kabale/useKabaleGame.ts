import { useCallback, useEffect, useState } from 'react'
import {
  deal,
  reduce,
  type Action,
  type DrawCount,
  type GameState,
} from './engine'

export interface KabaleControls {
  state: GameState
  drawCount: DrawCount
  dispatch: (action: Action) => void
  newGame: (drawCount: DrawCount) => void
  /** Sekunder i det igangværende parti. Fryser, når det er vundet. */
  elapsed: number
  /** Hvornår partiet begyndte (`Date.now()`). */
  startedAt: number
}

/**
 * Spillets forbindelse til uret. Reglerne ligger i `engine.ts` og ved intet
 * om tiden — her bliver den til det tal, pointene regnes ud fra.
 */
export function useKabaleGame(): KabaleControls {
  const [drawCount, setDrawCount] = useState<DrawCount>(1)
  const [state, setState] = useState<GameState>(() => deal(1, Math.random))
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  const dispatch = useCallback((action: Action) => {
    setState((prev) => reduce(prev, action))
  }, [])

  const newGame = useCallback((count: DrawCount) => {
    const start = Date.now()
    setDrawCount(count)
    setStartedAt(start)
    setNow(start)
    setState(deal(count, Math.random))
  }, [])

  const running = state.status === 'playing'

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running, startedAt])

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))

  return { state, drawCount, dispatch, newGame, elapsed, startedAt }
}
