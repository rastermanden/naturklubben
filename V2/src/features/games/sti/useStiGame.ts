import { useCallback, useEffect, useState } from 'react'
import {
  createGame,
  reduce,
  startGame,
  type Action,
  type CourseClass,
  type StiState,
} from './engine'

export interface StiControls {
  state: StiState
  start: (level: CourseClass) => void
  dispatch: (action: Action) => void
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

const KEYS: Record<string, { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 },
  A: { dx: -1, dy: 0 },
  d: { dx: 1, dy: 0 },
  D: { dx: 1, dy: 0 },
  w: { dx: 0, dy: -1 },
  W: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  S: { dx: 0, dy: 1 },
}

/**
 * Spillets forbindelse til browseren: tastaturet. Reglerne ligger i
 * `engine.ts` og ved intet om taster -- her bliver et tryk til et skridt.
 */
export function useStiGame(): StiControls {
  const [state, setState] = useState<StiState>(createGame)

  const dispatch = useCallback((action: Action) => {
    setState((prev) => reduce(prev, action))
  }, [])

  const start = useCallback((level: CourseClass) => {
    setState(startGame(level, Math.random))
  }, [])

  const running = state.status === 'running'
  useEffect(() => {
    if (!running) return

    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.altKey) return
      if (event.ctrlKey) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      const step = KEYS[event.key]
      if (!step) return
      dispatch({ type: 'move', ...step })
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, running])

  return { state, start, dispatch }
}
