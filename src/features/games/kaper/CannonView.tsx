import type { PointerEvent as ReactPointerEvent } from 'react'
import { useRef } from 'react'
import {
  AIM_MAX_ELEVATION,
  AIM_MAX_SIDE,
  type Aim,
  type Enemy,
  type ShotResult,
  type Wind,
} from './engine'

const WIDTH = 320
const HEIGHT = 200
const HORIZON = 100
const CENTER_X = WIDTH / 2

/** Sigtekornets udsving på skærmen pr. enhed i sigtet. */
const SIDE_SCALE = 60 / AIM_MAX_SIDE
const ELEVATION_SCALE = 48 / AIM_MAX_ELEVATION

interface CannonViewProps {
  enemy: Enemy
  aim: Aim
  wind: Wind
  shot: ShotResult | null
  onAim: (aim: Aim) => void
}

/** Fjendens skib set fra siden, ca. 100 bred og 60 høj med vandlinjen i y=48. */
function EnemyShip({ pirate }: { pirate: boolean }) {
  return (
    <g>
      <path d="M2 40 L98 40 L86 56 L14 56 Z" fill="#3b2a1a" />
      <path d="M2 40 L98 40 L94 45 L6 45 Z" fill="#5c4530" />
      <line x1="32" y1="4" x2="32" y2="40" stroke="#241608" strokeWidth="2" />
      <line x1="66" y1="8" x2="66" y2="40" stroke="#241608" strokeWidth="2" />
      <path d="M34 8 L58 30 L34 30 Z" fill="#f5f0e6" />
      <path d="M30 12 L12 30 L30 30 Z" fill="#ebe4d6" />
      <path d="M68 12 L88 32 L68 32 Z" fill="#f5f0e6" />
      <path d="M64 16 L48 32 L64 32 Z" fill="#ebe4d6" />
      {pirate ? (
        <g>
          <rect x="33" y="1" width="14" height="8" fill="#111111" />
          <circle cx="40" cy="5" r="2" fill="#ffffff" />
        </g>
      ) : (
        <g>
          <rect x="33" y="1" width="14" height="8" fill="#012169" />
          <path
            d="M33 1 L47 9 M47 1 L33 9"
            stroke="#ffffff"
            strokeWidth="1.6"
          />
          <path
            d="M33 1 L47 9 M47 1 L33 9"
            stroke="#c8102e"
            strokeWidth="0.6"
          />
          <path d="M40 1 L40 9 M33 5 L47 5" stroke="#ffffff" strokeWidth="2" />
          <path d="M40 1 L40 9 M33 5 L47 5" stroke="#c8102e" strokeWidth="1" />
        </g>
      )}
    </g>
  )
}

function Splash({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <ellipse cx="0" cy="0" rx="10" ry="3" fill="rgb(255 255 255 / 0.85)" />
      <path
        d="M-6 -2 L-4 -14 M0 -3 L0 -18 M6 -2 L4 -14"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </g>
  )
}

function splashPosition(outcome: ShotResult['outcome']) {
  switch (outcome) {
    case 'left':
      return { x: CENTER_X - 70, y: HORIZON + 12, size: 1 }
    case 'right':
      return { x: CENTER_X + 70, y: HORIZON + 12, size: 1 }
    case 'short':
      return { x: CENTER_X, y: HORIZON + 48, size: 1.4 }
    case 'long':
      return { x: CENTER_X + 14, y: HORIZON - 4, size: 0.55 }
    default:
      return null
  }
}

/**
 * Kanondækket: fjenden i kikkerten, sigtekornet, vinden og afstanden. Man
 * sigter ved at røre billedet, dér hvor kuglen skal hen -- eller med pilene.
 */
export function CannonView({ enemy, aim, wind, shot, onAim }: CannonViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const scale = 1.25 - (enemy.distance - 500) / 1000
  const crossX = CENTER_X + aim.side * SIDE_SCALE
  const crossY = HORIZON - aim.elevation * ELEVATION_SCALE
  const splash = shot ? splashPosition(shot.outcome) : null

  // Vindpilen peger den vej, kuglen drives: sidevinden mod venstre for
  // positive værdier, medvind opad mod fjenden.
  const windLength = (wind.strength / 10) * 14
  const windDx = wind.side === 0 ? 0 : -Math.sign(wind.side) * windLength
  const windDy = wind.range === 0 ? 0 : -Math.sign(wind.range) * windLength

  function aimAt(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || shot) return
    const rect = svg.getBoundingClientRect()
    const fit = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
    if (!fit) return
    const offsetX = (rect.width - WIDTH * fit) / 2
    const offsetY = (rect.height - HEIGHT * fit) / 2
    const x = (event.clientX - rect.left - offsetX) / fit
    const y = (event.clientY - rect.top - offsetY) / fit
    onAim({
      side: (x - CENTER_X) / SIDE_SCALE,
      elevation: (HORIZON - y) / ELEVATION_SCALE,
    })
  }

  const label = `${enemy.type.name} på ${enemy.distance} fods afstand. Sigtet står ${aim.elevation} i højden og ${aim.side} til siden.`

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        aimAt(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons > 0) aimAt(event)
      }}
      className="block h-auto w-full touch-none select-none rounded-lg"
    >
      <rect width={WIDTH} height={HORIZON} fill="#cfe7f5" />
      <rect
        y={HORIZON}
        width={WIDTH}
        height={HEIGHT - HORIZON}
        fill="#3d7fb5"
      />
      <line
        x1="0"
        y1={HORIZON}
        x2={WIDTH}
        y2={HORIZON}
        stroke="#2b5f8a"
        strokeWidth="1"
      />

      <g
        transform={`translate(${CENTER_X - 50 * scale} ${HORIZON + 4 - 48 * scale}) scale(${scale})`}
      >
        <EnemyShip pirate={!enemy.type.english} />
        {shot?.outcome === 'hit' && (
          <g>
            <circle cx="50" cy="30" r="22" fill="rgb(255 140 0 / 0.55)" />
            <circle cx="50" cy="30" r="10" fill="#fff3b0" />
          </g>
        )}
      </g>

      {splash && <Splash x={splash.x} y={splash.y} size={splash.size} />}

      {!shot && (
        <g stroke="#111827" strokeWidth="1.4" fill="none">
          <circle
            cx={crossX}
            cy={crossY}
            r="9"
            stroke="#ffffff"
            strokeWidth="3"
          />
          <circle cx={crossX} cy={crossY} r="9" />
          <line x1={crossX - 14} y1={crossY} x2={crossX + 14} y2={crossY} />
          <line x1={crossX} y1={crossY - 14} x2={crossX} y2={crossY + 14} />
        </g>
      )}

      <g transform="translate(30 166)">
        <circle r="20" fill="rgb(255 255 255 / 0.85)" stroke="#1f2937" />
        {wind.strength > 0 ? (
          <g stroke="#b91c1c" strokeWidth="2.5" strokeLinecap="round">
            <line x1="0" y1="0" x2={windDx} y2={windDy} />
            <circle cx={windDx} cy={windDy} r="2.5" fill="#b91c1c" />
          </g>
        ) : (
          <circle r="2.5" fill="#1f2937" />
        )}
      </g>
      <text x="58" y="162" fontSize="11" fill="#ffffff" fontWeight="600">
        Vind {wind.strength}
      </text>
      <text x="58" y="177" fontSize="11" fill="#ffffff" fontWeight="600">
        Afstand {enemy.distance}
      </text>
    </svg>
  )
}
