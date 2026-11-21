import {
  BRAL_CANS_PER_COIN,
  BRAL_CAN_SPAWN_INTERVAL_S,
  BRAL_COIN_VALUES,
  BRAL_DURATION_SECONDS,
  BRAL_INITIAL_CANS,
  BRAL_MAX_COINS_PER_GAME,
  BRAL_MAX_COIN_VALUE,
  BRAL_MELT_CANS_PER_SEC,
  BRAL_MIN_COIN_VALUE,
  bralScoreIsPlausible,
} from '../../../../convex/bralRules'

export {
  BRAL_CANS_PER_COIN,
  BRAL_CAN_SPAWN_INTERVAL_S,
  BRAL_COIN_VALUES,
  BRAL_DURATION_SECONDS,
  BRAL_INITIAL_CANS,
  BRAL_MAX_COINS_PER_GAME,
  BRAL_MAX_COIN_VALUE,
  BRAL_MELT_CANS_PER_SEC,
  BRAL_MIN_COIN_VALUE,
  bralScoreIsPlausible,
}

export const BRAL_WORLD = { w: 360, h: 320 } as const

export const OVEN_MIN_TEMP = 300
export const OVEN_MAX_TEMP = 900
export const OVEN_SWEET_MIN = 580
export const OVEN_SWEET_MAX = 740
export const OVEN_TARGET_TEMP = 660
export const OVEN_START_TEMP = 650
export const OVEN_COOL_PER_SEC = 42
export const BELLOWS_BOOST = 68

export const OVERHEAT_LOSS_PER_SEC = 0.55
export const MOLTEN_CAPACITY = 12

export const CAN_PLAY_TOP_Y = 20
export const CAN_PLAY_BOTTOM_Y = 172
export const CAN_HIT_RADIUS = 36
export const MAX_ACTIVE_CANS = 6

export const STRIKE_TI_HALF_WIDTH = 0.09
export const STRIKE_FEM_HALF_WIDTH = 0.24
export const STRIKE_SPEED = 1.15
export const STRIKE_COOLDOWN_S = 0.3
export const LAST_COIN_TTL_S = 1.1

export type BralStatus = 'ready' | 'playing' | 'over'
export type OvenZone = 'cold' | 'optimal' | 'hot'
export type CoinDenomination = 'en' | 'fem' | 'ti'

export interface FallingCan {
  id: number
  x: number
  y: number
  speed: number
  tilt: number
}

export interface LastCoin {
  denomination: CoinDenomination
  label: string
  value: number
  ttl: number
}

export interface BralState {
  status: BralStatus
  timeLeft: number
  score: number
  coins: number
  cansCaught: number
  crucibleCans: number
  molten: number
  ovenTemp: number
  cans: FallingCan[]
  spawnTimer: number
  markerPos: number
  markerDir: 1 | -1
  strikeCooldown: number
  lastCoin: LastCoin | null
  nextId: number
}

export function ovenZone(temp: number): OvenZone {
  if (temp < OVEN_SWEET_MIN) return 'cold'
  if (temp <= OVEN_SWEET_MAX) return 'optimal'
  return 'hot'
}

export function evaluateStrike(markerPos: number): {
  denomination: CoinDenomination
  label: string
  value: number
} {
  const offset = Math.abs(markerPos - 0.5)
  if (offset <= STRIKE_TI_HALF_WIDTH) {
    return {
      denomination: 'ti',
      label: 'Ti Bral',
      value: BRAL_COIN_VALUES.ti,
    }
  }
  if (offset <= STRIKE_FEM_HALF_WIDTH) {
    return {
      denomination: 'fem',
      label: 'Fem Bral',
      value: BRAL_COIN_VALUES.fem,
    }
  }
  return {
    denomination: 'en',
    label: 'En Bral',
    value: BRAL_COIN_VALUES.en,
  }
}

export function canStrike(state: BralState): boolean {
  return (
    state.status === 'playing' &&
    state.molten >= BRAL_CANS_PER_COIN &&
    state.strikeCooldown <= 0 &&
    state.coins < BRAL_MAX_COINS_PER_GAME
  )
}

export function createBralState(): BralState {
  return {
    status: 'ready',
    timeLeft: BRAL_DURATION_SECONDS,
    score: 0,
    coins: 0,
    cansCaught: 0,
    crucibleCans: 0,
    molten: 0,
    ovenTemp: OVEN_START_TEMP,
    cans: [],
    spawnTimer: BRAL_CAN_SPAWN_INTERVAL_S,
    markerPos: 0.5,
    markerDir: 1,
    strikeCooldown: 0,
    lastCoin: null,
    nextId: 1,
  }
}

function pickCanX(cans: readonly FallingCan[], rng: () => number): number {
  const margin = 34
  const span = BRAL_WORLD.w - margin * 2
  let x = margin + rng() * span
  const previous = cans[cans.length - 1]
  if (previous && Math.abs(x - previous.x) < 48) {
    x =
      previous.x < BRAL_WORLD.w / 2
        ? Math.min(BRAL_WORLD.w - margin, previous.x + 56)
        : Math.max(margin, previous.x - 56)
  }
  return x
}

function makeCan(
  id: number,
  y: number,
  cans: readonly FallingCan[],
  rng: () => number,
): FallingCan {
  return {
    id,
    x: pickCanX(cans, rng),
    y,
    speed: 48 + rng() * 18,
    tilt: (rng() * 2 - 1) * 0.18,
  }
}

export function startBral(rng: () => number = Math.random): BralState {
  const base = createBralState()
  const cans: FallingCan[] = []
  let nextId = base.nextId
  for (let index = 0; index < BRAL_INITIAL_CANS; index += 1) {
    const y = CAN_PLAY_TOP_Y + 4 + index * 40
    cans.push(makeCan(nextId++, y, cans, rng))
  }
  return {
    ...base,
    status: 'playing',
    cans,
    nextId,
  }
}

export function catchCanAt(
  state: BralState,
  x: number,
  y: number,
): { state: BralState; caught: boolean } {
  if (state.status !== 'playing') return { state, caught: false }
  const radiusSq = CAN_HIT_RADIUS * CAN_HIT_RADIUS
  let bestIndex = -1
  let bestY = -Infinity

  for (let index = 0; index < state.cans.length; index += 1) {
    const can = state.cans[index]
    const dx = can.x - x
    const dy = can.y - y
    if (dx * dx + dy * dy <= radiusSq && can.y > bestY) {
      bestY = can.y
      bestIndex = index
    }
  }

  if (bestIndex === -1) return { state, caught: false }

  const cans = state.cans.filter((_, index) => index !== bestIndex)
  return {
    caught: true,
    state: {
      ...state,
      cans,
      cansCaught: state.cansCaught + 1,
      crucibleCans: state.crucibleCans + 1,
    },
  }
}

export function catchLowestCan(state: BralState): {
  state: BralState
  caught: boolean
} {
  if (state.status !== 'playing' || state.cans.length === 0) {
    return { state, caught: false }
  }

  let bestIndex = 0
  for (let index = 1; index < state.cans.length; index += 1) {
    if (state.cans[index].y > state.cans[bestIndex].y) {
      bestIndex = index
    }
  }

  const cans = state.cans.filter((_, index) => index !== bestIndex)
  return {
    caught: true,
    state: {
      ...state,
      cans,
      cansCaught: state.cansCaught + 1,
      crucibleCans: state.crucibleCans + 1,
    },
  }
}

export function pumpBellows(state: BralState): BralState {
  if (state.status !== 'playing') return state
  return {
    ...state,
    ovenTemp: Math.min(OVEN_MAX_TEMP, state.ovenTemp + BELLOWS_BOOST),
  }
}

export function strikeCoin(state: BralState): BralState {
  if (!canStrike(state)) return state
  const result = evaluateStrike(state.markerPos)
  const rawMolten = Math.max(0, state.molten - BRAL_CANS_PER_COIN)
  const molten = rawMolten < 1e-6 ? 0 : rawMolten
  return {
    ...state,
    molten,
    coins: state.coins + 1,
    score: state.score + result.value,
    strikeCooldown: STRIKE_COOLDOWN_S,
    lastCoin: {
      ...result,
      ttl: LAST_COIN_TTL_S,
    },
  }
}

export function stepBral(
  state: BralState,
  dtSeconds: number,
  rng: () => number = Math.random,
): BralState {
  if (state.status !== 'playing') return state

  const dt = Math.min(Math.max(dtSeconds, 0), 0.1)
  const rawTimeLeft = state.timeLeft - dt
  const timeLeft = rawTimeLeft < 1e-6 ? 0 : rawTimeLeft

  const ovenTemp = Math.max(
    OVEN_MIN_TEMP,
    state.ovenTemp - OVEN_COOL_PER_SEC * dt,
  )
  const zone = ovenZone(ovenTemp)

  let crucibleCans = state.crucibleCans
  let molten = state.molten
  if (zone === 'optimal') {
    const amount = Math.min(
      crucibleCans,
      MOLTEN_CAPACITY - molten,
      BRAL_MELT_CANS_PER_SEC * dt,
    )
    crucibleCans -= amount
    molten += amount
    if (crucibleCans < 1e-6) {
      molten = Math.min(MOLTEN_CAPACITY, molten + crucibleCans)
      crucibleCans = 0
    }
    if (Math.abs(molten - Math.round(molten)) < 1e-6) {
      molten = Math.min(MOLTEN_CAPACITY, Math.round(molten))
    }
  } else if (zone === 'hot') {
    molten = Math.max(0, molten - OVERHEAT_LOSS_PER_SEC * dt)
  }

  const cans = state.cans
    .map((can) => ({ ...can, y: can.y + can.speed * dt }))
    .filter((can) => can.y <= CAN_PLAY_BOTTOM_Y)

  let spawnTimer = state.spawnTimer - dt
  let nextId = state.nextId
  while (spawnTimer <= 0 && timeLeft > 0) {
    spawnTimer += BRAL_CAN_SPAWN_INTERVAL_S
    if (cans.length < MAX_ACTIVE_CANS) {
      cans.push(makeCan(nextId++, CAN_PLAY_TOP_Y, cans, rng))
    }
  }

  let markerPos = state.markerPos
  let markerDir = state.markerDir
  if (molten >= BRAL_CANS_PER_COIN) {
    markerPos += markerDir * STRIKE_SPEED * dt
    if (markerPos >= 1) {
      markerPos = Math.max(0, 2 - markerPos)
      markerDir = -1
    } else if (markerPos <= 0) {
      markerPos = Math.min(1, -markerPos)
      markerDir = 1
    }
  }

  const strikeCooldown = Math.max(0, state.strikeCooldown - dt)
  let lastCoin = state.lastCoin
  if (lastCoin) {
    const nextTtl = lastCoin.ttl - dt
    lastCoin = nextTtl <= 0 ? null : { ...lastCoin, ttl: nextTtl }
  }

  if (timeLeft <= 0) {
    return {
      ...state,
      status: 'over',
      timeLeft: 0,
      ovenTemp,
      crucibleCans,
      molten,
      cans: [],
      spawnTimer,
      markerPos,
      markerDir,
      strikeCooldown,
      lastCoin,
      nextId,
    }
  }

  return {
    ...state,
    timeLeft,
    ovenTemp,
    crucibleCans,
    molten,
    cans,
    spawnTimer,
    markerPos,
    markerDir,
    strikeCooldown,
    lastCoin,
    nextId,
  }
}
