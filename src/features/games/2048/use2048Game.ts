import { useCallback, useEffect, useState } from 'react'
import {
  createGame,
  move as moveState,
  startGame,
  type Direction,
  type Game2048State,
} from './engine'

export interface Game2048Controls {
  state: Game2048State
  start: () => void
  move: (direction: Direction) => void
  /** Hvornår det igangværende spil begyndte (`Date.now()`), 0 før det første. */
  startedAt: number
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

/**
 * Spillets forbindelse til browseren: tastaturet og uret. Reglerne ligger i
 * `engine.ts` og ved intet om nogen af delene. Der er ingen billedløkke --
 * 2048 sker kun, når spilleren gør noget.
 */
export function use2048Game(): Game2048Controls {
  const [state, setState] = useState<Game2048State>(createGame)
  const [startedAt, setStartedAt] = useState(0)

  const start = useCallback(() => {
    setStartedAt(Date.now())
    setState(startGame())
  }, [])

  const move = useCallback((direction: Direction) => {
    setState((prev) => moveState(prev, direction))
  }, [])

  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.altKey) return
      if (event.ctrlKey) return
      // Står burgermenuen eller en anden dialog åben, hører tasterne til
      // den -- ikke til brættet bagved.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      const direction = KEY_DIRECTIONS[event.key]
      if (!direction) return
      // Piletasterne ruller siden, hvis de får lov.
      event.preventDefault()
      if (event.repeat) return
      move(direction)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [move])

  return { state, start, move, startedAt }
}
