import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatScore } from '../leaderboard'
import { usePersonalBest, usePlayerId, useSubmitScore } from '../useGameScores'
import { drawBral } from './draw'
import {
  BRAL_DURATION_SECONDS,
  BRAL_WORLD,
  canStrike,
  catchCanAt,
  catchLowestCan,
  createBralState,
  ovenZone,
  pumpBellows,
  startBral,
  stepBral,
  strikeCoin,
  type BralState,
} from './engine'

const ZONE_LABELS = {
  cold: 'For kold',
  optimal: 'Smelter',
  hot: 'For varm!',
} as const

/**
 * Bral smeltning: saml faldende øldåser, hold ovnen omkring 660 °C,
 * og slå Bral-mønter inden uret når nul.
 */
export function BralGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [snapshot, setSnapshot] = useState<BralState>(createBralState)
  const stateRef = useRef(snapshot)
  const userId = usePlayerId()
  const personalBest = usePersonalBest('bral')
  const submitScore = useSubmitScore('bral')
  const submitted = useRef(false)
  const bestBefore = useRef(0)
  const finishedSeconds = useRef(0)
  const suppressBellowsClick = useRef(false)
  const suppressStrikeClick = useRef(false)
  const [record, setRecord] = useState(false)

  function syncSnapshot(next: BralState) {
    const previous = stateRef.current
    stateRef.current = next
    if (
      previous.status !== next.status ||
      previous.score !== next.score ||
      previous.coins !== next.coins ||
      Math.ceil(previous.timeLeft) !== Math.ceil(next.timeLeft) ||
      canStrike(previous) !== canStrike(next) ||
      ovenZone(previous.ovenTemp) !== ovenZone(next.ovenTemp) ||
      Math.round(previous.ovenTemp / 5) !== Math.round(next.ovenTemp / 5) ||
      previous.lastCoin?.label !== next.lastCoin?.label
    ) {
      setSnapshot(next)
    }
  }

  useEffect(() => {
    let frame = 0
    let lastTime = performance.now()
    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000
      lastTime = now
      const stepped = stepBral(stateRef.current, dt)
      syncSnapshot(stepped)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx) drawBral(ctx, stepped)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  function handleBellows() {
    const next = pumpBellows(stateRef.current)
    syncSnapshot(next)
  }

  function handleStrike() {
    const next = strikeCoin(stateRef.current)
    syncSnapshot(next)
  }

  function handleCatchLowest() {
    const { state: next, caught } = catchLowestCan(stateRef.current)
    if (caught) syncSnapshot(next)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || stateRef.current.status !== 'playing') return
      if (
        event.key === 'b' ||
        event.key === 'B' ||
        event.key === 'ArrowUp' ||
        event.key === 'w' ||
        event.key === 'W'
      ) {
        if (event.key === 'ArrowUp') event.preventDefault()
        handleBellows()
      } else if (
        event.key === 'd' ||
        event.key === 'D' ||
        event.key === 'ArrowDown' ||
        event.key === 'f' ||
        event.key === 'F'
      ) {
        if (event.key === 'ArrowDown') event.preventDefault()
        handleCatchLowest()
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        handleStrike()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function begin() {
    submitted.current = false
    setRecord(false)
    bestBefore.current = personalBest.data?.score ?? 0
    const next = startBral()
    stateRef.current = next
    setSnapshot(next)
  }

  function saveResult(seconds: number) {
    if (!userId || snapshot.score <= 0) return
    submitScore.mutate({
      score: snapshot.score,
      lines: snapshot.coins,
      level: 1,
      durationSeconds: seconds,
    })
  }

  // Resultatet gemmes af sig selv, når partiet er slut. `submitted` sikrer
  // ét kald, og mangler spilleren endnu, venter effekten på `userId`.
  useEffect(() => {
    if (snapshot.status !== 'over' || submitted.current) return
    if (snapshot.score <= 0) {
      submitted.current = true
      return
    }
    if (!userId) return
    submitted.current = true
    finishedSeconds.current = Math.max(
      0,
      Math.min(BRAL_DURATION_SECONDS, Math.round(snapshot.elapsedSeconds)),
    )
    setRecord(snapshot.score > bestBefore.current)
    saveResult(finishedSeconds.current)
    // saveResult læser det parti, effekten allerede har set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, userId])

  function handleCanvasPointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (stateRef.current.status !== 'playing') return
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = ((event.clientX - rect.left) / rect.width) * BRAL_WORLD.w
    const y = ((event.clientY - rect.top) / rect.height) * BRAL_WORLD.h
    if (y >= 252 && canStrike(stateRef.current)) {
      handleStrike()
      return
    }
    const { state: next, caught } = catchCanAt(stateRef.current, x, y)
    if (caught) syncSnapshot(next)
  }

  const playing = snapshot.status === 'playing'
  const strikeReady = canStrike(snapshot)
  const zone = ovenZone(snapshot.ovenTemp)
  const zoneLabel = ZONE_LABELS[zone]
  const secondsLeft = Math.max(0, Math.ceil(snapshot.timeLeft))

  const liveStatus =
    snapshot.status === 'over'
      ? `Partiet er slut. ${formatScore(snapshot.score)} point og ${snapshot.coins} ${snapshot.coins === 1 ? 'mønt' : 'mønter'}.`
      : snapshot.lastCoin
        ? `${snapshot.lastCoin.label}, ${snapshot.lastCoin.value} point.`
        : ''

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex gap-2">
        <Tile label="Point" value={formatScore(snapshot.score)} />
        <Tile label="Mønter" value={String(snapshot.coins)} />
        <Tile label="Tid" value={`${secondsLeft} s`} />
        <Tile
          label="Bedst"
          value={formatScore(personalBest.data?.score ?? 0)}
        />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line-soft bg-[#132329]">
        <canvas
          ref={canvasRef}
          width={BRAL_WORLD.w * 2}
          height={BRAL_WORLD.h * 2}
          onPointerDown={handleCanvasPointerDown}
          className="block h-auto w-full touch-none select-none"
          aria-label="Bral-støberiet"
        />
        {snapshot.status !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#132329]/85 p-4 text-center text-white">
            <p className="text-lg font-semibold">
              {snapshot.status === 'over' ? 'Tiden er gået' : 'Bral smeltning'}
            </p>
            <p className="max-w-sm text-sm text-white/85">
              {snapshot.status === 'over'
                ? `Du fik ${formatScore(snapshot.score)} point fra ${snapshot.coins} ${snapshot.coins === 1 ? 'mønt' : 'mønter'}.`
                : 'Tryk på de faldende øldåser, hold ovnen omkring 660 °C med blæsebælgen, og slå En, Fem eller Ti Bral. Fire dåser giver én mønt på et minut.'}
            </p>
            {snapshot.status === 'over' && record && snapshot.score > 0 && (
              <p className="text-sm font-medium text-warn-ring">
                Ny personlig rekord!
              </p>
            )}
            {snapshot.status === 'over' && submitScore.isPending && (
              <p className="text-sm text-white/80">Gemmer resultatet…</p>
            )}
            {snapshot.status === 'over' && submitScore.isError && (
              <button
                type="button"
                onClick={() => saveResult(finishedSeconds.current)}
                className="min-h-11 rounded border border-white/60 px-4 py-2 text-sm"
              >
                Resultatet blev ikke gemt. Prøv igen
              </button>
            )}
            {snapshot.status === 'over' && submitScore.isSuccess && (
              <p className="text-sm text-white/80">Resultatet er på listen.</p>
            )}
            <button
              type="button"
              onClick={begin}
              className="min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
            >
              {snapshot.status === 'over' ? 'Spil igen' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <div className="grid touch-none grid-cols-2 gap-3 select-none">
        <button
          type="button"
          disabled={!playing}
          onPointerDown={(event) => {
            if (!playing) return
            event.preventDefault()
            suppressBellowsClick.current = true
            handleBellows()
          }}
          onPointerCancel={() => {
            suppressBellowsClick.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              suppressBellowsClick.current = false
            }
          }}
          onClick={() => {
            if (suppressBellowsClick.current) {
              suppressBellowsClick.current = false
              return
            }
            handleBellows()
          }}
          aria-label="Blæsebælg"
          className="flex h-16 touch-none flex-col items-center justify-center rounded-xl border border-line-strong bg-surface px-3 text-ink-body select-none active:bg-surface-raised disabled:opacity-40"
        >
          <span className="font-semibold">Blæsebælg</span>
          <span className="text-xs text-ink-subtle tabular-nums">
            {Math.round(snapshot.ovenTemp)} °C · {zoneLabel}
          </span>
        </button>

        <button
          type="button"
          disabled={!strikeReady}
          onPointerDown={(event) => {
            if (!strikeReady) return
            event.preventDefault()
            suppressStrikeClick.current = true
            handleStrike()
          }}
          onPointerCancel={() => {
            suppressStrikeClick.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              suppressStrikeClick.current = false
            }
          }}
          onClick={() => {
            if (suppressStrikeClick.current) {
              suppressStrikeClick.current = false
              return
            }
            handleStrike()
          }}
          aria-label="Slå mønt"
          className={`flex h-16 touch-none flex-col items-center justify-center rounded-xl border px-3 select-none disabled:opacity-40 ${
            strikeReady
              ? 'border-accent bg-accent text-on-accent active:bg-accent-hover'
              : 'border-line-strong bg-surface text-ink-body'
          }`}
        >
          <span className="font-semibold">Slå mønt</span>
          <span
            className={`text-xs ${
              strikeReady ? 'text-on-accent/90' : 'text-ink-subtle'
            }`}
          >
            {strikeReady ? 'Klar til prægning' : 'Mangler metal'}
          </span>
        </button>
      </div>

      <p className="text-sm text-ink-subtle">
        Tryk på dåserne på skærmen, eller brug D til at gribe, B eller pil op
        til blæsebælgen og mellemrum til at slå mønten.
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </p>
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
