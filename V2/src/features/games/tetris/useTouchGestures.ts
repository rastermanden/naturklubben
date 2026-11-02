import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { TetrisControls } from './useTetrisGame'

/** Hvor langt fingeren skal trækkes for at flytte brikken ét felt. */
const CELL_DRAG_PX = 26
/** Hvor langt et træk nedad skal være, før det er et hårdt fald. */
const HARD_DROP_PX = 90
/** Et tryk, der hverken flytter sig eller varer ved, er en drejning. */
const TAP_MOVE_PX = 12
const TAP_MS = 250

/**
 * Brættet skal kunne spilles med tommelfingeren: træk til siden flytter
 * brikken, træk nedad sænker den, et langt træk nedad smider den, og et hurtigt
 * tryk drejer den. Knapperne under brættet gør det samme -- gestikken er en
 * genvej for dem, der kender den, ikke den eneste vej ind i spillet.
 */
export function useTouchGestures(controls: TetrisControls) {
  const gesture = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedAt: 0,
    moved: false,
    dropped: false,
  })

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return
    gesture.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: event.timeStamp,
      moved: false,
      dropped: false,
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current.active || event.pointerId !== current.pointerId) return

    const downwards = event.clientY - current.startY
    if (
      !current.dropped &&
      downwards > HARD_DROP_PX &&
      Math.abs(event.clientX - current.startX) < HARD_DROP_PX / 2
    ) {
      current.dropped = true
      current.moved = true
      controls.hardDrop()
      return
    }
    if (current.dropped) return

    const sideways = event.clientX - current.lastX
    const steps = Math.trunc(sideways / CELL_DRAG_PX)
    if (steps !== 0) {
      current.moved = true
      current.lastX += steps * CELL_DRAG_PX
      for (let index = 0; index < Math.abs(steps); index += 1) {
        if (steps > 0) controls.press('right')
        else controls.press('left')
        controls.release(steps > 0 ? 'right' : 'left')
      }
      return
    }

    const down = event.clientY - current.lastY
    if (down > CELL_DRAG_PX) {
      current.moved = true
      current.lastY += CELL_DRAG_PX
      controls.press('down')
      controls.release('down')
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current.active || event.pointerId !== current.pointerId) return
    current.active = false

    const travelled = Math.hypot(
      event.clientX - current.startX,
      event.clientY - current.startY,
    )
    if (
      !current.moved &&
      travelled < TAP_MOVE_PX &&
      event.timeStamp - current.startedAt < TAP_MS
    ) {
      controls.rotateCw()
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    // Uden den ruller siden under fingeren, mens man spiller.
    style: { touchAction: 'none' as const },
  }
}
