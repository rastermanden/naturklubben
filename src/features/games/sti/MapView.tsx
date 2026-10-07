import { useEffect, useRef } from 'react'
import {
  TERRAIN_COST,
  TERRAIN_LABEL,
  TERRAINS,
  type StiState,
  type Terrain,
  mapLabel,
} from './engine'

/** Fast kortfarve, som havet i Kaptajn Kaper: et billede af terrænet, ikke en flade i temaet. */
const TERRAIN_COLOR: Record<Terrain, string> = {
  path: '#e4c98a',
  meadow: '#c6db7a',
  forest: '#2f7d4a',
  thicket: '#1b4332',
  bog: '#a08a52',
  water: '#4f93c8',
}

const CELL = 28
const CONTROL = '#6d28d9'
const PLAYER = '#f97316'

/**
 * Banen, tegnet som SVG, så hvert felt kan stå stille, mens man trækker i
 * vinduet omkring det. Nord er opad.
 */
export function MapView({ state }: { state: StiState }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    const player = playerRef.current
    if (!scroller || !player) return
    const frame = scroller.getBoundingClientRect()
    const dot = player.getBoundingClientRect()
    if (frame.width === 0 || frame.height === 0) return
    const margin = CELL
    if (dot.top < frame.top + margin) {
      scroller.scrollTop -= frame.top + margin - dot.top
    } else if (dot.bottom > frame.bottom - margin) {
      scroller.scrollTop += dot.bottom - (frame.bottom - margin)
    }
    if (dot.left < frame.left + margin) {
      scroller.scrollLeft -= frame.left + margin - dot.left
    } else if (dot.right > frame.right - margin) {
      scroller.scrollLeft += dot.right - (frame.right - margin)
    }
  }, [state.x, state.y])

  const width = state.width * CELL
  const height = state.height * CELL

  return (
    <div
      ref={scrollerRef}
      className="max-h-[42svh] overflow-auto overscroll-contain"
    >
      <div className="mx-auto w-fit">
        <p
          aria-hidden="true"
          className="pb-1 text-center text-xs font-medium text-ink-subtle"
        >
          N
        </p>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={mapLabel(state)}
          className="block select-none"
        >
          {state.terrain.map((row, y) =>
            row.map((cell, x) => (
              <rect
                key={`${x}-${y}`}
                x={x * CELL}
                y={y * CELL}
                width={CELL}
                height={CELL}
                fill={TERRAIN_COLOR[cell]}
                stroke="rgba(0, 0, 0, 0.16)"
                strokeWidth={0.5}
              />
            )),
          )}
          {state.controls.map((control, index) => {
            const punched = index < state.nextIndex
            const current = index === state.nextIndex
            const cx = control.x * CELL + CELL / 2
            const cy = control.y * CELL + CELL / 2
            const radius = current ? 11 : 9
            return (
              <g key={`${control.x}-${control.y}`} opacity={punched ? 0.4 : 1}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="#ffffff"
                  stroke={CONTROL}
                  strokeWidth={current ? 2.5 : 1.5}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#3b0764"
                  fontSize={index >= 9 ? 10 : 12}
                  fontWeight={700}
                >
                  {index + 1}
                </text>
              </g>
            )
          })}
          <circle
            ref={playerRef}
            cx={state.x * CELL + CELL / 2}
            cy={state.y * CELL + CELL / 2}
            r={5}
            fill={PLAYER}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </div>
  )
}

export function TerrainLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-subtle">
      {TERRAINS.map((terrain) => (
        <li key={terrain} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm border border-black/10"
            style={{ backgroundColor: TERRAIN_COLOR[terrain] }}
          />
          {TERRAIN_LABEL[terrain]}
          {terrain === 'water' ? '' : ` ${TERRAIN_COST[terrain]}`}
        </li>
      ))}
    </ul>
  )
}
