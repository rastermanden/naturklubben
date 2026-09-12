import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** Kortere end dette er et tryk eller en rystelse, ikke et træk. */
const SWIPE_MIN_PX = 24

export type SwipeDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Ét fingertræk, én retning. Fingeren sættes ned, trækkes, og når den slippes,
 * er hele rejsen ét træk i den retning, den gik længst i.
 *
 * Det er en anden slags gestik end Tetris' `useTouchGestures`: den trækker
 * brikken felt for felt, mens fingeren stadig er nede, og gør et tryk til en
 * drejning. Her er der ingen brik at følge -- kun en retning at vælge -- så
 * spil, der styres med "skub alt til én side", deler denne.
 *
 * Bruges på et element: `<div {...useSwipeDirection(onSwipe)}>`.
 */
export function useSwipeDirection(
  onSwipe: (direction: SwipeDirection) => void,
) {
  const gesture = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
  })

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    // Museklik hører til knapperne; på desktop bruger man tastaturet.
    if (event.pointerType === 'mouse') return
    gesture.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current
    if (!current.active || event.pointerId !== current.pointerId) return
    current.active = false

    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return

    if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? 'right' : 'left')
    else onSwipe(dy > 0 ? 'down' : 'up')
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerId === gesture.current.pointerId) {
      gesture.current.active = false
    }
  }

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    // Uden den ruller siden under fingeren, mens man spiller.
    style: { touchAction: 'none' as const },
  }
}
