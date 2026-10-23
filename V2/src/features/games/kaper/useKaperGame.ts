import { useCallback, useEffect, useState } from 'react'
import {
  createGame,
  reduce,
  startGame,
  type Action,
  type KaperState,
} from './engine'

export interface KaperControls {
  state: KaperState
  start: (captain: string) => void
  dispatch: (action: Action) => void
  /** Hvornår det igangværende spil begyndte -- til varigheden på listen. */
  startedAt: number
}

/** Hvor lang tid et skridt i indsejlingen tager. Kortere, jo højere rangen er. */
export function harbourStepMs(difficulty: number): number {
  return 800 - 25 * difficulty
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

/**
 * Spillets forbindelse til browseren: terningen, tastaturet og uret i
 * indsejlingen. Reglerne ligger i `engine.ts` og ved intet om nogen af
 * delene -- her omsættes tid og tastetryk til de handlinger, reglerne forstår.
 */
export function useKaperGame(): KaperControls {
  const [state, setState] = useState<KaperState>(createGame)
  const [startedAt, setStartedAt] = useState(0)

  const dispatch = useCallback((action: Action) => {
    setState((prev) => reduce(prev, action, Math.random))
  }, [])

  const start = useCallback((captain: string) => {
    setStartedAt(Date.now())
    setState(startGame(captain))
  }, [])

  // Indsejlingen: reden glider forbi i et fast tempo, og man styrer imens.
  // Uret går kun, mens indsejlingen er i gang -- og ikke, mens fanen er skjult,
  // så man ikke kommer tilbage til et skib, der er sejlet i molen af sig selv.
  const inHarbour =
    state.status === 'running' && state.screen.kind === 'harbour'
  const { difficulty } = state
  useEffect(() => {
    if (!inHarbour) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      dispatch({ type: 'harbourTick' })
    }, harbourStepMs(difficulty))
    return () => window.clearInterval(timer)
  }, [difficulty, dispatch, inHarbour])

  const screenKind = state.status === 'running' ? state.screen.kind : null
  const shotPending =
    state.screen.kind === 'cannon' && state.screen.shot !== null
  useEffect(() => {
    if (!screenKind) return

    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.altKey) return
      if (event.ctrlKey) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      const action = keyAction(event.key, screenKind!, shotPending)
      if (!action) return
      dispatch(action)
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, screenKind, shotPending])

  return { state, start, dispatch, startedAt }
}

const MAP_KEYS: Record<string, { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  Home: { dx: -1, dy: -1 },
  PageUp: { dx: 1, dy: -1 },
  End: { dx: -1, dy: 1 },
  PageDown: { dx: 1, dy: 1 },
  // Taltastaturet, som i det oprindelige spil.
  '1': { dx: -1, dy: 1 },
  '2': { dx: 0, dy: 1 },
  '3': { dx: 1, dy: 1 },
  '4': { dx: -1, dy: 0 },
  '6': { dx: 1, dy: 0 },
  '7': { dx: -1, dy: -1 },
  '8': { dx: 0, dy: -1 },
  '9': { dx: 1, dy: -1 },
}

/** Sigtet flytter sig fem ad gangen på tastaturet -- ét ad gangen er for langsomt. */
const AIM_STEP = 5

/** Hvad en tast betyder på den skærm, spilleren står på. */
export function keyAction(
  key: string,
  screen: KaperState['screen']['kind'],
  shotPending: boolean,
): Action | null {
  switch (screen) {
    case 'map': {
      const move = MAP_KEYS[key]
      return move ? { type: 'move', ...move } : null
    }
    case 'cannon':
      if (shotPending) {
        return key === 'Enter' || key === ' ' || key === 'f' || key === 'F'
          ? { type: 'dismissShot' }
          : null
      }
      switch (key) {
        case 'ArrowLeft':
          return { type: 'aim', elevation: 0, side: -AIM_STEP }
        case 'ArrowRight':
          return { type: 'aim', elevation: 0, side: AIM_STEP }
        case 'ArrowUp':
          return { type: 'aim', elevation: -AIM_STEP, side: 0 }
        case 'ArrowDown':
          return { type: 'aim', elevation: AIM_STEP, side: 0 }
        case 'f':
        case 'F':
        case 'Enter':
        case ' ':
          return { type: 'fire' }
        case '0':
        case 'Escape':
          return { type: 'withdraw' }
        default:
          return null
      }
    case 'harbour':
      if (key === 'ArrowLeft' || key === '4') return { type: 'steer', dx: -1 }
      if (key === 'ArrowRight' || key === '6') return { type: 'steer', dx: 1 }
      return null
    case 'report':
    case 'harbourIntro':
      return key === 'Enter' || key === ' ' ? { type: 'continue' } : null
    default:
      return null
  }
}
