import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createGame,
  hardDrop as hardDropState,
  holdPiece,
  move,
  rotate,
  softDrop,
  startGame,
  tick,
  togglePause as togglePauseState,
  type TetrisState,
} from './engine'

/** Hvor længe en holdt pileknap venter, før brikken begynder at glide. */
const DAS_MS = 160
/** Hvor hurtigt den glider derefter -- ét felt pr. dette antal millisekunder. */
const ARR_MS = 40
/** Samme for den holdte "ned"-knap. */
const SOFT_DROP_MS = 40
/**
 * Et enkelt billede må aldrig flytte spillet mere end så meget. Vender man
 * tilbage til en fane, der har ligget stille i to minutter, skal brikken ikke
 * nå at falde to minutters værd på ét hug.
 */
const MAX_FRAME_MS = 100

export type Direction = 'left' | 'right' | 'down'

export interface TetrisControls {
  state: TetrisState
  start: () => void
  togglePause: () => void
  rotateCw: () => void
  rotateCcw: () => void
  hardDrop: () => void
  hold: () => void
  /** Tryk en retning ned (og hold den). */
  press: (direction: Direction) => void
  release: (direction: Direction) => void
}

/**
 * Spillets forbindelse til browseren: billedløkken, tastaturet og de holdte
 * knapper. Reglerne ligger i `engine.ts` og ved intet om nogen af delene --
 * her omsættes tid og tryk til de kald, reglerne forstår.
 */
export function useTetrisGame(): TetrisControls {
  const [state, setState] = useState<TetrisState>(createGame)
  const held = useRef({ left: false, right: false, down: false })
  const timers = useRef({ direction: 0, das: 0, arr: 0, soft: 0 })

  const start = useCallback(() => {
    held.current = { left: false, right: false, down: false }
    timers.current = { direction: 0, das: 0, arr: 0, soft: 0 }
    setState(startGame())
  }, [])

  const togglePause = useCallback(() => {
    held.current = { left: false, right: false, down: false }
    setState(togglePauseState)
  }, [])

  const rotateCw = useCallback(() => setState((prev) => rotate(prev, 1)), [])
  const rotateCcw = useCallback(() => setState((prev) => rotate(prev, -1)), [])
  const hardDrop = useCallback(
    () => setState((prev) => hardDropState(prev)),
    [],
  )
  const hold = useCallback(() => setState((prev) => holdPiece(prev)), [])

  const press = useCallback((direction: Direction) => {
    if (held.current[direction]) return
    held.current[direction] = true

    // Første tryk flytter med det samme; auto-gentagelsen venter på DAS.
    if (direction === 'down') {
      timers.current.soft = 0
      setState(softDrop)
      return
    }
    timers.current.das = 0
    timers.current.arr = 0
    setState((prev) => move(prev, direction === 'left' ? -1 : 1))
  }, [])

  const release = useCallback((direction: Direction) => {
    held.current[direction] = false
  }, [])

  // Billedløkken. Den kører kun, mens et spil er i gang, så en pause eller en
  // afsluttet omgang ikke holder browseren vågen.
  const running = state.status === 'running'
  useEffect(() => {
    if (!running) return

    let frame = 0
    let previous = performance.now()

    function step(now: number) {
      const delta = Math.min(now - previous, MAX_FRAME_MS)
      previous = now

      const direction =
        held.current.left === held.current.right
          ? 0
          : held.current.left
            ? -1
            : 1
      if (direction !== timers.current.direction) {
        timers.current.direction = direction
        timers.current.das = 0
        timers.current.arr = 0
      }

      let sideSteps = 0
      if (direction !== 0) {
        timers.current.das += delta
        if (timers.current.das >= DAS_MS) {
          timers.current.arr += delta
          while (timers.current.arr >= ARR_MS) {
            timers.current.arr -= ARR_MS
            sideSteps += 1
          }
        }
      }

      let dropSteps = 0
      if (held.current.down) {
        timers.current.soft += delta
        while (timers.current.soft >= SOFT_DROP_MS) {
          timers.current.soft -= SOFT_DROP_MS
          dropSteps += 1
        }
      }

      setState((prev) => {
        if (prev.status !== 'running') return prev
        let next = prev
        for (let index = 0; index < sideSteps; index += 1) {
          next = move(next, direction)
        }
        for (let index = 0; index < dropSteps; index += 1) {
          next = softDrop(next)
        }
        return tick(next, delta)
      })

      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [running])

  // Skifter man væk fra appen midt i et spil, sættes det på pause i stedet for
  // at køre videre i baggrunden -- eller at stå og vente på et kæmpe tidsspring.
  useEffect(() => {
    function pauseWhenHidden() {
      if (document.visibilityState !== 'hidden') return
      held.current = { left: false, right: false, down: false }
      setState((prev) =>
        prev.status === 'running' ? togglePauseState(prev) : prev,
      )
    }

    document.addEventListener('visibilitychange', pauseWhenHidden)
    window.addEventListener('blur', pauseWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden)
      window.removeEventListener('blur', pauseWhenHidden)
    }
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
      // Står burgermenuen eller en anden dialog åben, hører tasterne til
      // den -- ikke til brættet bagved.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      switch (event.key) {
        case 'ArrowLeft':
          press('left')
          break
        case 'ArrowRight':
          press('right')
          break
        case 'ArrowDown':
          press('down')
          break
        case 'ArrowUp':
        case 'x':
        case 'X':
          if (event.repeat) return
          rotateCw()
          break
        case 'z':
        case 'Z':
        case 'Control':
          if (event.repeat) return
          rotateCcw()
          break
        case ' ':
          if (event.repeat) return
          hardDrop()
          break
        case 'c':
        case 'C':
        case 'Shift':
          if (event.repeat) return
          hold()
          break
        case 'p':
        case 'P':
        case 'Escape':
          if (event.repeat) return
          togglePause()
          break
        default:
          return
      }
      // Piletaster og mellemrum ruller siden, hvis de får lov.
      event.preventDefault()
    }

    function onKeyUp(event: KeyboardEvent) {
      switch (event.key) {
        case 'ArrowLeft':
          release('left')
          break
        case 'ArrowRight':
          release('right')
          break
        case 'ArrowDown':
          release('down')
          break
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [hardDrop, hold, press, release, rotateCcw, rotateCw, togglePause])

  return {
    state,
    start,
    togglePause,
    rotateCw,
    rotateCcw,
    hardDrop,
    hold,
    press,
    release,
  }
}
