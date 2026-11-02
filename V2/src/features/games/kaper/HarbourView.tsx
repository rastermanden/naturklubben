import {
  HARBOUR_MAX_X,
  HARBOUR_MIN_X,
  HARBOUR_STEPS,
  type HarbourState,
} from './engine'
import { ShipGlyph } from './MapView'

const CELL = 10
const COLUMNS = HARBOUR_MAX_X - HARBOUR_MIN_X + 1
const WIDTH = COLUMNS * CELL
/** Så mange rækker forude kan man se. */
const VISIBLE_ROWS = 12
const HEIGHT = (VISIBLE_ROWS + 1) * CELL
/** Spillerens skib ligger fast i den øverste række; reden glider forbi. */
const PLAYER_Y = CELL

interface HarbourViewProps {
  harbour: HarbourState
  onSteer: (dx: -1 | 1) => void
}

/**
 * Indsejlingen: skibene på reden kommer glidende nedefra, og til sidst molen
 * med sit hul. Man styrer ved at trykke i venstre eller højre side af billedet.
 */
export function HarbourView({ harbour, onSteer }: HarbourViewProps) {
  const column = (x: number) => (x - HARBOUR_MIN_X) * CELL
  const wallY = PLAYER_Y + HARBOUR_STEPS * CELL
  const gapLeft = column(harbour.gapStart)
  const gapRight = column(harbour.gapStart + harbour.gapWidth)

  const label = `Indsejling, skridt ${harbour.row} af ${HARBOUR_STEPS}. Skibet er i søjle ${harbour.x}; hullet i molen er søjle ${harbour.gapStart} til ${harbour.gapStart + harbour.gapWidth - 1}.`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onSteer(event.clientX - rect.left < rect.width / 2 ? -1 : 1)
      }}
      className="block h-auto w-full touch-none select-none rounded-lg"
    >
      <rect width={WIDTH} height={HEIGHT} fill="#5b9fd0" />

      <g
        style={{
          transform: `translateY(${-harbour.row * CELL}px)`,
          transition: 'transform 220ms linear',
        }}
      >
        {Array.from({ length: HARBOUR_STEPS + 1 }, (_, row) => (
          <line
            key={`wave-${row}`}
            x1="0"
            y1={PLAYER_Y + row * CELL + CELL - 0.5}
            x2={WIDTH}
            y2={PLAYER_Y + row * CELL + CELL - 0.5}
            stroke="rgb(255 255 255 / 0.18)"
            strokeWidth="1"
            strokeDasharray="6 8"
          />
        ))}
        {harbour.ships.map(([x, row], index) => (
          <g
            key={index}
            transform={`translate(${column(x) + CELL / 2} ${PLAYER_Y + row * CELL + CELL / 2}) scale(1.5) translate(${-CELL / 2} ${-CELL / 2})`}
          >
            <ShipGlyph flag="#1d4ed8" />
          </g>
        ))}

        <rect x="0" y={wallY} width={gapLeft} height={CELL} fill="#6b7280" />
        <rect
          x={gapRight}
          y={wallY}
          width={WIDTH - gapRight}
          height={CELL}
          fill="#6b7280"
        />
        <rect x="0" y={wallY + 2} width={gapLeft} height={2} fill="#9ca3af" />
        <rect
          x={gapRight}
          y={wallY + 2}
          width={WIDTH - gapRight}
          height={2}
          fill="#9ca3af"
        />
        <rect
          x="0"
          y={wallY + CELL}
          width={WIDTH}
          height={VISIBLE_ROWS * CELL}
          fill="#d9c58a"
        />
      </g>

      <g
        transform={`translate(${column(harbour.x) + CELL / 2} ${PLAYER_Y + CELL / 2}) scale(1.5) translate(${-CELL / 2} ${-CELL / 2})`}
      >
        <ShipGlyph />
      </g>

      {harbour.lastEvent === 'gust' && (
        <text
          x={WIDTH / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#ffffff"
        >
          Vindstød {harbour.windDirection < 0 ? '←' : '→'}
        </text>
      )}
      {harbour.lastEvent === 'hit' && (
        <text
          x={WIDTH / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#fde68a"
        >
          Bump! Skibet tog skade
        </text>
      )}
    </svg>
  )
}
