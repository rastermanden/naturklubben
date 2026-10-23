import { useEffect, useRef } from 'react'
import {
  BOARD_WIDTH,
  HIDDEN_HEIGHT,
  VISIBLE_HEIGHT,
  ghostPiece,
  occupiedCells,
  type TetrisState,
} from './engine'
import { GHOST_ALPHA, GRID_LINE_COLOR, PIECE_COLORS } from './colors'

/**
 * Brættet tegnes på et canvas frem for i 200 elementer. Det er ikke
 * optimeringsiver: brættet tegnes om tres gange i sekundet, og det er
 * forskellen på et spil, der glider, og et, der hakker på en telefon.
 *
 * Selve tilstanden -- point, niveau, hvad der lige skete -- står som almindelig
 * tekst ved siden af, så en skærmlæser har noget at læse op. Canvasset er
 * derfor mærket op som et billede med en kort beskrivelse og ikke som
 * spillets eneste kilde til, hvad der foregår.
 */
interface TetrisBoardProps {
  state: TetrisState
  className?: string
}

function roundedCell(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const inset = Math.max(1, size * 0.06)
  const radius = Math.max(2, size * 0.18)
  context.beginPath()
  // roundRect er nyt nok til, at en ældre browser kan mangle den. Så bliver
  // klodserne skarpe i hjørnerne i stedet for at spillet ikke kan tegnes.
  if (typeof context.roundRect === 'function') {
    context.roundRect(
      x + inset,
      y + inset,
      size - inset * 2,
      size - inset * 2,
      radius,
    )
  } else {
    context.rect(x + inset, y + inset, size - inset * 2, size - inset * 2)
  }
}

export function TetrisBoard({ state, className }: TetrisBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      const element = canvasRef.current
      if (!element) return
      const ratio = window.devicePixelRatio || 1
      const width = element.clientWidth
      const height = element.clientHeight
      if (width === 0 || height === 0) return
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      sizeRef.current = { width, height }
    }

    resize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    if (canvas.width === 0 || canvas.height === 0) return

    const cell = canvas.width / BOARD_WIDTH
    context.clearRect(0, 0, canvas.width, canvas.height)

    context.strokeStyle = GRID_LINE_COLOR
    context.lineWidth = Math.max(1, cell * 0.02)
    for (let column = 1; column < BOARD_WIDTH; column += 1) {
      context.beginPath()
      context.moveTo(column * cell, 0)
      context.lineTo(column * cell, canvas.height)
      context.stroke()
    }
    for (let row = 1; row < VISIBLE_HEIGHT; row += 1) {
      context.beginPath()
      context.moveTo(0, row * cell)
      context.lineTo(canvas.width, row * cell)
      context.stroke()
    }

    function paint(x: number, y: number, color: string, alpha = 1) {
      // Rækkerne over kanten er brikkens venteværelse og tegnes ikke.
      const row = y - HIDDEN_HEIGHT
      if (row < 0) return
      context!.globalAlpha = alpha
      context!.fillStyle = color
      roundedCell(context!, x * cell, row * cell, cell)
      context!.fill()
      context!.globalAlpha = 1
    }

    state.board.forEach((row, y) => {
      row.forEach((piece, x) => {
        if (piece) paint(x, y, PIECE_COLORS[piece])
      })
    })

    if (state.active && state.status !== 'over') {
      const ghost = ghostPiece(state.board, state.active)
      if (ghost.y !== state.active.y) {
        for (const { x, y } of occupiedCells(ghost)) {
          paint(x, y, PIECE_COLORS[state.active.type], GHOST_ALPHA)
        }
      }
      for (const { x, y } of occupiedCells(state.active)) {
        paint(x, y, PIECE_COLORS[state.active.type])
      }
    }
  }, [state])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      /* Mærkatet står med vilje stille. Point, rækker og niveau ændrer sig
         mange gange i sekundet og står som almindelig tekst lige over
         brættet -- lagde de sig her, ville en skærmlæser aldrig blive
         færdig. */
      aria-label="Tetrisbræt. Point, rækker og niveau står over brættet."
      className={`h-full w-full rounded-lg bg-surface-sunken ${className ?? ''}`}
    />
  )
}
