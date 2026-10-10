import { useCallback, useEffect, useState } from 'react'
import {
  createGame,
  reduce,
  startGame,
  type Action,
  type FugletraekState,
  type GameClass,
} from './engine'

export interface FugletraekControls {
  state: FugletraekState
  start: (level: GameClass) => void
  dispatch: (action: Action) => void
  /** Sekunder gået i det igangværende parti. Fryser, når det er klaret. */
  elapsed: number
}

/** Hvor længe to forskellige kort bliver liggende åbne, før de vendes tilbage. */
const MISMATCH_MS = 900

/**
 * Spillets forbindelse til browseren: uret og tilbagevendingen af to
 * forskellige kort. Reglerne ligger i `engine.ts` og ved intet om nogen af
 * delene -- her bliver tiden til point og et mismatch til en pause.
 */
export function useFugletraekGame(): FugletraekControls {
  const [state, setState] = useState<FugletraekState>(createGame)
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const dispatch = useCallback((action: Action) => {
    setState((prev) => reduce(prev, action))
  }, [])

  const start = useCallback((level: GameClass) => {
    setStartedAt(Date.now())
    setElapsed(0)
    setState(startGame(level, Math.random))
  }, [])

  const running = state.status === 'running'

  // Uret tikker én gang i sekundet, mens partiet kører. Når partiet er slut,
  // stopper intervallet, og `elapsed` står på den sidst talte tid.
  useEffect(() => {
    if (!running || startedAt === 0) return
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, startedAt])

  // To forskellige kort vendes tilbage af sig selv efter en kort pause.
  const mismatch = state.mismatch
  useEffect(() => {
    if (!mismatch) return
    const id = window.setTimeout(() => {
      setState((prev) => reduce(prev, { type: 'clearMismatch' }))
    }, MISMATCH_MS)
    return () => window.clearTimeout(id)
  }, [mismatch])

  return { state, start, dispatch, elapsed }
}
