import type { KaperState } from './engine'
import { CLEARED, LAND, MAP_COLUMNS, MAP_ROWS, PORTS, type Port } from './map'

const CELL = 10

/**
 * Kortets farver er faste som Tetris-brikkernes: havet er blåt, og land er
 * sand, uanset tema. Det er et billede af Kattegat, ikke en flade i appen.
 */
const SEA_COLOR = '#5b9fd0'
const LAND_COLOR = '#d9c58a'
const LAND_EDGE = '#a48f57'
const PORT_COLOR = '#1f2937'

function labelPosition(port: Port): {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
} {
  const cx = port.x * CELL + CELL / 2
  const cy = port.y * CELL + CELL / 2
  switch (port.label) {
    case 'left':
      return { x: cx - 7, y: cy + 2.5, anchor: 'end' }
    case 'right':
      return { x: cx + 7, y: cy + 2.5, anchor: 'start' }
    case 'above':
      return { x: cx, y: cy - 6.5, anchor: 'middle' }
    default:
      return { x: cx, y: cy + 12, anchor: 'middle' }
  }
}

/** Et lille skib i et felt: skrog, mast og sejl. */
export function ShipGlyph({ flag = '#c62828' }: { flag?: string }) {
  return (
    <g>
      <path d="M1.5 6.5 L8.5 6.5 L7.4 8.8 L2.6 8.8 Z" fill="#4a2f1c" />
      <line
        x1="5"
        y1="1.5"
        x2="5"
        y2="6.5"
        stroke="#2b1a0e"
        strokeWidth="0.6"
      />
      <path d="M5.3 2 L8.3 5.6 L5.3 5.6 Z" fill="#fafafa" />
      <path d="M4.7 2.6 L2.2 5.6 L4.7 5.6 Z" fill="#f0f0f0" />
      <path d="M5 1.2 L7 1.9 L5 2.6 Z" fill={flag} />
    </g>
  )
}

/**
 * Kortet: land, havne, de felter, hvor et slag er vundet, og skibet selv.
 * Tegnet som SVG, fordi det kun ændrer sig, når spilleren trækker -- og fordi
 * hvert felt så kan få en tekst, en oplæser kan bruge.
 */
export function MapView({ state }: { state: KaperState }) {
  const port = PORTS.find(
    (candidate) => candidate.x === state.x && candidate.y === state.y,
  )
  const description = port
    ? `Skibet ligger i ${port.name}.`
    : `Skibet er på felt ${state.x}, ${state.y}.`

  return (
    <svg
      viewBox={`0 0 ${MAP_COLUMNS * CELL} ${MAP_ROWS * CELL}`}
      role="img"
      aria-label={`Kort over Kattegat. ${description}`}
      className="block h-auto w-full rounded-lg"
    >
      <rect
        width={MAP_COLUMNS * CELL}
        height={MAP_ROWS * CELL}
        fill={SEA_COLOR}
      />

      {state.map.map((row, y) =>
        row.map((cell, x) => {
          if (cell === LAND) {
            return (
              <rect
                key={`${x}-${y}`}
                x={x * CELL}
                y={y * CELL}
                width={CELL}
                height={CELL}
                rx={2}
                fill={LAND_COLOR}
                stroke={LAND_EDGE}
                strokeWidth={0.4}
              />
            )
          }
          if (cell === CLEARED) {
            return (
              <text
                key={`${x}-${y}`}
                x={x * CELL + CELL / 2}
                y={y * CELL + CELL / 2 + 2.2}
                textAnchor="middle"
                fontSize={6}
                fill="rgb(255 255 255 / 0.7)"
              >
                ×
              </text>
            )
          }
          return null
        }),
      )}

      {PORTS.map((harbour) => {
        const label = labelPosition(harbour)
        return (
          <g key={harbour.id}>
            <circle
              cx={harbour.x * CELL + CELL / 2}
              cy={harbour.y * CELL + CELL / 2}
              r={3.2}
              fill={PORT_COLOR}
              stroke="#ffffff"
              strokeWidth={1}
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              fontSize={6.5}
              fontWeight={600}
              fill="#0f172a"
              stroke="#ffffff"
              strokeWidth={1.6}
              paintOrder="stroke"
            >
              {harbour.name}
            </text>
          </g>
        )
      })}

      <g
        transform={`translate(${state.x * CELL + CELL / 2} ${state.y * CELL + CELL / 2}) scale(1.5) translate(${-CELL / 2} ${-CELL / 2})`}
      >
        <ShipGlyph />
      </g>
    </svg>
  )
}
