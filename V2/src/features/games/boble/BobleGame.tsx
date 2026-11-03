import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  createBobleState,
  startBoble,
  stepBoble,
  type BobleInput,
  type BobleState,
} from './engine'
import { BOBLE_WORLD } from './engine'
import { drawBoble } from './draw'

const BEST_KEY = 'naturklubben:boble-bedst'

function readBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function writeBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score))
  } catch {
    // Privat tilstand kan afvise lageret. Spillet virker stadig.
  }
}

const emptyInput = (): BobleInput => ({
  left: false,
  right: false,
  jumpPressed: false,
  shootPressed: false,
})

/**
 * Boble-spillet: hop, skyd bobler, fang og punkter.
 * Rekorden ligger kun i browseren.
 */
export function BobleGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [snapshot, setSnapshot] = useState<BobleState>(createBobleState)
  const stateRef = useRef(snapshot)
  const inputRef = useRef(emptyInput())
  const edges = useRef({ jump: false, shoot: false })
  const [best, setBest] = useState(readBest)

  useEffect(() => {
    let frame = 0
    const loop = () => {
      const input = inputRef.current
      const stepped = stepBoble(stateRef.current, {
        ...input,
        jumpPressed: edges.current.jump,
        shootPressed: edges.current.shoot,
      })
      edges.current.jump = false
      edges.current.shoot = false
      const previous = stateRef.current
      stateRef.current = stepped
      if (
        previous.status !== stepped.status ||
        previous.score !== stepped.score ||
        previous.lives !== stepped.lives ||
        previous.level !== stepped.level
      ) {
        setSnapshot(stepped)
      }
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx) drawBoble(ctx, stepped)
      if (stepped.status === 'over') {
        setBest((current) => {
          if (stepped.score <= current) return current
          writeBest(stepped.score)
          return stepped.score
        })
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (event.repeat) return
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        inputRef.current.left = true
      }
      if (
        event.key === 'ArrowRight' ||
        event.key === 'd' ||
        event.key === 'D'
      ) {
        inputRef.current.right = true
      }
      if (
        event.key === 'ArrowUp' ||
        event.key === 'w' ||
        event.key === 'W' ||
        event.key === ' '
      ) {
        edges.current.jump = true
        event.preventDefault()
      }
      if (event.key === 'x' || event.key === 'X' || event.key === 'Control') {
        edges.current.shoot = true
      }
    }
    function up(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        inputRef.current.left = false
      }
      if (
        event.key === 'ArrowRight' ||
        event.key === 'd' ||
        event.key === 'D'
      ) {
        inputRef.current.right = false
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  function begin() {
    const next = startBoble(stateRef.current)
    stateRef.current = next
    setSnapshot(next)
  }

  function hold(
    key: 'left' | 'right',
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault()
    inputRef.current[key] = true
  }

  function release(key: 'left' | 'right') {
    inputRef.current[key] = false
  }

  const playing = snapshot.status === 'playing'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Tile label="Point" value={String(snapshot.score)} />
        <Tile label="Liv" value={String(snapshot.lives)} />
        <Tile label="Bane" value={String(snapshot.level + 1)} />
        <Tile label="Bedst" value={String(best)} />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line-soft bg-[#14343c]">
        <canvas
          ref={canvasRef}
          width={BOBLE_WORLD.w}
          height={BOBLE_WORLD.h}
          className="h-auto w-full touch-none"
          aria-label="Boble-spillets bane"
        />
        {snapshot.status !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#14343c]/80 p-4 text-center text-white">
            <p className="text-lg font-semibold">
              {snapshot.status === 'over' ? 'Spillet er slut' : 'Boble-spillet'}
            </p>
            <p className="max-w-sm text-sm text-white/80">
              {snapshot.status === 'over'
                ? `Du fik ${snapshot.score} point.`
                : 'Hop mellem platformene, skyd en boble, og punkter den, når en modstander sidder fast.'}
            </p>
            <button
              type="button"
              onClick={begin}
              className="min-h-11 rounded bg-accent px-4 py-2 text-white"
            >
              {snapshot.status === 'over' ? 'Spil igen' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-ink-subtle">
        Pile eller A og D går til siden. Pil op, W eller mellemrum hopper. X
        eller Ctrl skyder. Inspireret af et klassisk arkadespil.
      </p>

      <div className="grid grid-cols-4 gap-2">
        <Hold
          label="Gå til venstre"
          disabled={!playing}
          onDown={(event) => hold('left', event)}
          onUp={() => release('left')}
        >
          ←
        </Hold>
        <Hold
          label="Gå til højre"
          disabled={!playing}
          onDown={(event) => hold('right', event)}
          onUp={() => release('right')}
        >
          →
        </Hold>
        <Tap
          label="Hop"
          disabled={!playing}
          onPress={() => {
            edges.current.jump = true
          }}
        >
          Hop
        </Tap>
        <Tap
          label="Skyd boble"
          disabled={!playing}
          onPress={() => {
            edges.current.shoot = true
          }}
        >
          Boble
        </Tap>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-line-soft bg-surface px-3 py-2">
      <span className="text-xs text-ink-subtle">{label}</span>
      <span className="truncate text-lg font-semibold text-ink-body tabular-nums">
        {value}
      </span>
    </div>
  )
}

const buttonClass =
  'flex h-14 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-body select-none active:bg-surface-raised disabled:opacity-40'

function Hold({
  label,
  disabled,
  onDown,
  onUp,
  children,
}: {
  label: string
  disabled: boolean
  onDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onUp: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      className={buttonClass}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function Tap({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string
  disabled: boolean
  onPress: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={buttonClass}
    >
      {children}
    </button>
  )
}
