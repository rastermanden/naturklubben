import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { formatScore } from '../leaderboard'
import { usePersonalBest, usePlayerId, useSubmitScore } from '../useGameScores'
import { drawBral } from './draw'
import {
  BRAL_CANS_PER_COIN,
  BRAL_DURATION_SECONDS,
  BRAL_MAX_COINS_PER_GAME,
  BRAL_TABS_PER_COIN,
  BRAL_WORLD,
  RELAY_TARGET_STEPS,
  canStrike,
  catchCanAt,
  catchLowestCan,
  createBralState,
  ovenZone,
  passRelay,
  pumpBellows,
  startBral,
  startRelay,
  stepBral,
  strikeCoin,
  type BralState,
  type RelayHand,
} from './engine'

const ZONE_LABELS = {
  cold: 'For kold',
  optimal: 'Smelter',
  hot: 'For varm!',
} as const

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return (
    target.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"]',
    ) !== null
  )
}

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
  const [record, setRecord] = useState(false)
  const [round, setRound] = useState(0)
  const [submittedRound, setSubmittedRound] = useState<number | null>(null)

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
      previous.lastCoin?.label !== next.lastCoin?.label ||
      previous.shortage !== next.shortage ||
      previous.pullTabs !== next.pullTabs ||
      previous.relay.active !== next.relay.active ||
      previous.relay.steps !== next.relay.steps ||
      previous.relay.nextHand !== next.relay.nextHand ||
      previous.shortageNotice?.text !== next.shortageNotice?.text
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
      if (canvas) {
        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
        const targetWidth = Math.round(BRAL_WORLD.w * dpr)
        const targetHeight = Math.round(BRAL_WORLD.h * dpr)
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth
          canvas.height = targetHeight
        }
        const ctx = canvas.getContext('2d')
        if (ctx) drawBral(ctx, stepped, dpr)
      }
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

  function handleStartRelay() {
    const next = startRelay(stateRef.current)
    if (next !== stateRef.current) syncSnapshot(next)
  }

  function handleRelayPass(hand: RelayHand) {
    const next = passRelay(stateRef.current, hand)
    if (next !== stateRef.current) syncSnapshot(next)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || stateRef.current.status !== 'playing') return
      if (isInteractiveTarget(event.target)) return
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
      } else if (event.key === 'r' || event.key === 'R') {
        handleStartRelay()
      } else if (
        stateRef.current.shortage === 'active' &&
        stateRef.current.relay.active
      ) {
        if (
          event.key === 'ArrowLeft' ||
          event.key === 'a' ||
          event.key === 'A' ||
          event.key === 'v' ||
          event.key === 'V'
        ) {
          if (event.key === 'ArrowLeft') event.preventDefault()
          handleRelayPass('left')
        } else if (
          event.key === 'ArrowRight' ||
          event.key === 'l' ||
          event.key === 'L' ||
          event.key === 'h' ||
          event.key === 'H'
        ) {
          if (event.key === 'ArrowRight') event.preventDefault()
          handleRelayPass('right')
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function begin() {
    submitted.current = false
    setRecord(false)
    setSubmittedRound(null)
    setRound((current) => current + 1)
    bestBefore.current = personalBest.data?.score ?? 0
    const next = startBral()
    stateRef.current = next
    setSnapshot(next)
  }

  function saveResult(seconds: number, targetRound: number) {
    if (!userId || snapshot.score <= 0) return
    setSubmittedRound(targetRound)
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
    saveResult(finishedSeconds.current, round)
    // saveResult læser det parti, effekten allerede har set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, userId, round])

  function handleCanvasPointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (stateRef.current.status !== 'playing' || event.button !== 0) return
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
  const strikeSublabel =
    snapshot.coins >= BRAL_MAX_COINS_PER_GAME
      ? 'Loft nået'
      : strikeReady
        ? 'Klar til prægning'
        : playing &&
            snapshot.molten >= BRAL_CANS_PER_COIN &&
            snapshot.strikeCooldown > 0
          ? 'Klar om lidt'
          : 'Mangler metal'
  const zone = ovenZone(snapshot.ovenTemp)
  const zoneLabel = ZONE_LABELS[zone]
  const secondsLeft = Math.max(0, Math.ceil(snapshot.timeLeft))
  const showSubmitStatus =
    snapshot.status === 'over' && snapshot.score > 0 && submittedRound === round

  const liveParts: string[] = []
  if (snapshot.status === 'over') {
    liveParts.push(
      `Partiet er slut. ${formatScore(snapshot.score)} point og ${snapshot.coins} ${snapshot.coins === 1 ? 'mønt' : 'mønter'}.`,
    )
  } else {
    if (snapshot.lastCoin) {
      liveParts.push(
        `${snapshot.lastCoin.label}, ${snapshot.lastCoin.value} point.`,
      )
    }
    if (snapshot.shortageNotice) {
      liveParts.push(snapshot.shortageNotice.text)
    } else if (snapshot.shortage === 'active') {
      liveParts.push(
        snapshot.relay.active
          ? `Ølstafet ${snapshot.relay.steps} af ${RELAY_TARGET_STEPS}.`
          : 'Dåsemangel aktiv.',
      )
    }
  }
  const liveStatus = liveParts.join(' ')

  return (
    <div
      data-testid="bral-container"
      className={`flex flex-col gap-3 select-none ${
        playing ? 'touch-none' : 'touch-manipulation'
      }`}
    >
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
        {playing && snapshot.shortage === 'active' && (
          <div
            role="region"
            aria-label="Dåsemangel"
            className="pointer-events-auto absolute inset-x-1.5 top-1.5 z-10 flex flex-col gap-1.5 rounded-lg border border-warn-line bg-warn-surface/95 px-2.5 py-2 text-warn-strong shadow-sm backdrop-blur-[2px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold tracking-wider">
                  {snapshot.relay.active
                    ? `FORCED RELAY · ${snapshot.relay.steps}/${RELAY_TARGET_STEPS}`
                    : 'CAN SHORTAGE · RESERVE BELOW PEG'}
                </p>
                <p className="font-mono text-xs opacity-90">
                  {snapshot.relay.active
                    ? 'Skift venstre og højre for at fylde lageret.'
                    : `Ringtræk ${snapshot.pullTabs}/${BRAL_TABS_PER_COIN} eller start alkoholfri ølstafet`}
                </p>
              </div>
              {!snapshot.relay.active && (
                <PressButton
                  onAction={handleStartRelay}
                  ariaLabel="Start ølstafet"
                  className="min-h-11 shrink-0 touch-none rounded-lg border border-warn-line bg-surface px-3 py-2 font-mono text-xs font-semibold text-ink-body select-none active:bg-surface-raised"
                >
                  Start ølstafet
                </PressButton>
              )}
            </div>
            {snapshot.relay.active && (
              <div className="grid grid-cols-2 gap-2">
                <PressButton
                  onAction={() => handleRelayPass('left')}
                  disabled={snapshot.relay.nextHand !== 'left'}
                  ariaLabel="Venstre hånd"
                  className={`flex min-h-11 touch-none items-center justify-center rounded-lg border px-3 py-2 font-mono text-xs font-semibold select-none disabled:opacity-40 ${
                    snapshot.relay.nextHand === 'left'
                      ? 'border-accent bg-accent text-on-accent active:bg-accent-hover'
                      : 'border-warn-line bg-surface text-ink-body'
                  }`}
                >
                  Venstre hånd
                </PressButton>
                <PressButton
                  onAction={() => handleRelayPass('right')}
                  disabled={snapshot.relay.nextHand !== 'right'}
                  ariaLabel="Højre hånd"
                  className={`flex min-h-11 touch-none items-center justify-center rounded-lg border px-3 py-2 font-mono text-xs font-semibold select-none disabled:opacity-40 ${
                    snapshot.relay.nextHand === 'right'
                      ? 'border-accent bg-accent text-on-accent active:bg-accent-hover'
                      : 'border-warn-line bg-surface text-ink-body'
                  }`}
                >
                  Højre hånd
                </PressButton>
              </div>
            )}
          </div>
        )}

        {playing && snapshot.shortageNotice && (
          <p className="pointer-events-none absolute inset-x-2 bottom-[47%] z-10 rounded-md border border-line-strong bg-surface-raised/95 px-2.5 py-1 text-center font-mono text-xs text-ink-body shadow-sm">
            {snapshot.shortageNotice.text}
          </p>
        )}

        {snapshot.status !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#132329]/85 p-4 text-center text-white">
            <p className="text-lg font-semibold">
              {snapshot.status === 'over' ? 'Tiden er gået' : 'Bral smeltning'}
            </p>
            <p className="max-w-sm text-sm text-white/85">
              {snapshot.status === 'over'
                ? `Du fik ${formatScore(snapshot.score)} point fra ${snapshot.coins} ${snapshot.coins === 1 ? 'mønt' : 'mønter'}.`
                : 'Tryk på de faldende øldåser, hold ovnen omkring 660 °C med blæsebælgen, og slå En, Fem eller Ti Bral. Fire dåser giver én mønt på et minut. Rammer dåsemanglen, samler du ringtræk eller løser den med en alkoholfri ølstafet.'}
            </p>
            {snapshot.status === 'over' && record && snapshot.score > 0 && (
              <p className="text-sm font-medium text-warn-ring">
                Ny personlig rekord!
              </p>
            )}
            {showSubmitStatus && submitScore.isPending && (
              <p className="text-sm text-white/80">Gemmer resultatet…</p>
            )}
            {showSubmitStatus && submitScore.isError && (
              <button
                type="button"
                onClick={() => saveResult(finishedSeconds.current, round)}
                className="min-h-11 rounded border border-white/60 px-4 py-2 text-sm"
              >
                Resultatet blev ikke gemt. Prøv igen
              </button>
            )}
            {showSubmitStatus && submitScore.isSuccess && (
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
        <PressButton
          disabled={!playing}
          onAction={handleBellows}
          ariaLabel="Blæsebælg"
          className="flex h-16 touch-none flex-col items-center justify-center rounded-xl border border-line-strong bg-surface px-3 text-ink-body select-none active:bg-surface-raised disabled:opacity-40"
        >
          <span className="font-semibold">Blæsebælg</span>
          <span className="text-xs text-ink-subtle tabular-nums">
            {Math.round(snapshot.ovenTemp)} °C · {zoneLabel}
          </span>
        </PressButton>

        <PressButton
          disabled={!strikeReady}
          onAction={handleStrike}
          ariaLabel="Slå mønt"
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
            {strikeSublabel}
          </span>
        </PressButton>
      </div>

      <p className="text-sm text-ink-subtle">
        Tryk på dåserne og ringtræk på skærmen, eller brug D til at gribe, B
        eller pil op til blæsebælgen og mellemrum til at slå mønten. Ved
        dåsemangel starter R en alkoholfri ølstafet med pil venstre og højre.
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </p>
    </div>
  )
}

function PressButton({
  ariaLabel,
  children,
  className,
  disabled = false,
  onAction,
}: {
  ariaLabel: string
  children: ReactNode
  className: string
  disabled?: boolean
  onAction: () => void
}) {
  const suppressClick = useRef(false)
  const pointerDownActive = useRef(false)
  const clearTimer = useRef<number | null>(null)
  const releaseWindowListeners = useRef<(() => void) | null>(null)

  function clearPendingTimer() {
    if (clearTimer.current !== null) {
      window.clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
  }

  function detachWindowListeners() {
    releaseWindowListeners.current?.()
    releaseWindowListeners.current = null
  }

  function resetSuppress() {
    clearPendingTimer()
    detachWindowListeners()
    pointerDownActive.current = false
    suppressClick.current = false
  }

  function scheduleSuppressClear() {
    clearPendingTimer()
    detachWindowListeners()
    pointerDownActive.current = false
    clearTimer.current = window.setTimeout(() => {
      clearTimer.current = null
      suppressClick.current = false
    }, 0)
  }

  useEffect(() => {
    if (!pointerDownActive.current) {
      if (clearTimer.current !== null) {
        window.clearTimeout(clearTimer.current)
        clearTimer.current = null
      }
      suppressClick.current = false
    }
  }, [disabled])

  useEffect(() => {
    return () => {
      if (clearTimer.current !== null) {
        window.clearTimeout(clearTimer.current)
        clearTimer.current = null
      }
      releaseWindowListeners.current?.()
      releaseWindowListeners.current = null
    }
  }, [])

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return
        event.preventDefault()
        clearPendingTimer()
        detachWindowListeners()
        pointerDownActive.current = true
        suppressClick.current = true

        const onWindowUp = () => scheduleSuppressClear()
        const onWindowCancel = () => resetSuppress()
        window.addEventListener('pointerup', onWindowUp)
        window.addEventListener('pointercancel', onWindowCancel)
        releaseWindowListeners.current = () => {
          window.removeEventListener('pointerup', onWindowUp)
          window.removeEventListener('pointercancel', onWindowCancel)
        }

        onAction()
      }}
      onPointerUp={() => {
        if (pointerDownActive.current) {
          scheduleSuppressClear()
        }
      }}
      onPointerCancel={() => {
        resetSuppress()
      }}
      onLostPointerCapture={() => {
        resetSuppress()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          resetSuppress()
        }
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          resetSuppress()
          return
        }
        if (disabled || event.button !== 0) return
        onAction()
      }}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
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
