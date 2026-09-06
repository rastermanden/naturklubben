/**
 * Selve spillet -- uden React, uden timere, uden tilfældighed, der ikke er
 * givet udefra.
 *
 * Alt her er rene funktioner: `tick(state, millisekunder, rng)` og de otte
 * handlinger tager en tilstand og giver en ny. Tiden er et tal, spillet får
 * fortalt, ikke noget det aflæser selv, og posen af brikker trækkes fra en
 * `rng`, kaldebeslutningen sender med. Det er dét, der gør et helt spil --
 * tyngdekraft, låsning, T-spins, niveauskift -- muligt at teste uden at vente
 * på et sekund eller gætte på et terningkast.
 */

import {
  kickOffsets,
  pieceCells,
  spawnColumn,
  PIECE_TYPES,
  type Coordinate,
  type PieceType,
  type Rotation,
} from './pieces'

export const BOARD_WIDTH = 10
/** Rækker, spilleren kan se. */
export const VISIBLE_HEIGHT = 20
/** Rækkerne over kanten, hvor brikken kommer ind. */
export const HIDDEN_HEIGHT = 2
export const BOARD_HEIGHT = VISIBLE_HEIGHT + HIDDEN_HEIGHT

/** Hvor mange kommende brikker spilleren får at se. */
export const NEXT_COUNT = 5

/** Niveauet stiger for hver tiende ryddede række. */
export const LINES_PER_LEVEL = 10
export const MAX_LEVEL = 20

/** Hvor længe en brik må hvile på bunden, før den låses fast. */
export const LOCK_DELAY_MS = 500
/** Hvor mange gange et træk må udskyde låsningen. Uden loftet kan en brik
 *  holdes svævende for evigt ved at dreje den frem og tilbage. */
export const MAX_LOCK_RESETS = 15

/**
 * Hurtigere end dette bliver spillet ikke -- ikke fordi formlen stopper, men
 * fordi det holder op med at være et spil. Guideline-kurven når under et
 * millisekund pr. række omkring niveau 20; her lægges bunden et sted, et
 * menneske stadig kan nå at reagere.
 */
export const MIN_GRAVITY_MS = 60

export type Cell = PieceType | null
export type Board = readonly (readonly Cell[])[]

export type GameStatus = 'idle' | 'running' | 'paused' | 'over'

export type TSpin = 'none' | 'mini' | 'full'

export interface ActivePiece {
  type: PieceType
  rotation: Rotation
  /** Tegnerammens øverste venstre hjørne på brættet. */
  x: number
  y: number
}

/** Det, der lige skete -- så brættet kan sige "Tetris!" og oplæseren det samme. */
export interface ClearEvent {
  lines: number
  tSpin: TSpin
  combo: number
  backToBack: boolean
  points: number
}

export interface TetrisState {
  board: Board
  active: ActivePiece | null
  /** De næste brikker, spilleren kan se. */
  next: readonly PieceType[]
  /** Resten af den igangværende pose. Se `drawPiece`. */
  bag: readonly PieceType[]
  hold: PieceType | null
  /** En gemt brik må kun byttes én gang pr. brik. */
  holdUsed: boolean
  score: number
  lines: number
  level: number
  /** Antal ryddende brikker i træk minus én. -1 betyder ingen kæde i gang. */
  combo: number
  backToBack: boolean
  status: GameStatus
  lastEvent: ClearEvent | null
  /** Millisekunder samlet op siden sidste tyngdekraftstrin. */
  gravityElapsed: number
  /** Millisekunder brikken har hvilet på bunden, eller null når den falder. */
  lockElapsed: number | null
  lockResets: number
  /** Sandt, når sidste vellykkede handling var en drejning (T-spin-reglen). */
  rotatedLast: boolean
  /** Hvilken kick-forskydning drejningen brugte -- 4 opgraderer en mini-T-spin. */
  lastKick: number
  /** Spillets varighed i millisekunder, samlet op af `tick`. */
  elapsedMs: number
}

export type RandomSource = () => number

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null as Cell),
  )
}

/**
 * "7-bag": hver af de syv brikker kommer én gang, før nogen af dem kommer igen.
 * Det er ikke pynt -- det er dét, der gør, at man aldrig venter tolv brikker på
 * en I, og at spillet kan planlægges frem for at håbes igennem.
 */
function refillBag(rng: RandomSource): PieceType[] {
  const bag = [...PIECE_TYPES]
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function drawPiece(
  bag: readonly PieceType[],
  rng: RandomSource,
): { piece: PieceType; bag: PieceType[] } {
  const remaining = bag.length > 0 ? [...bag] : refillBag(rng)
  const piece = remaining.shift() as PieceType
  return { piece, bag: remaining }
}

function fillQueue(
  next: readonly PieceType[],
  bag: readonly PieceType[],
  rng: RandomSource,
): { next: PieceType[]; bag: PieceType[] } {
  const queue = [...next]
  let remaining = [...bag]
  while (queue.length < NEXT_COUNT) {
    const draw = drawPiece(remaining, rng)
    queue.push(draw.piece)
    remaining = draw.bag
  }
  return { next: queue, bag: remaining }
}

export function occupiedCells(piece: ActivePiece): Coordinate[] {
  return pieceCells(piece.type, piece.rotation).map((cell) => ({
    x: piece.x + cell.x,
    y: piece.y + cell.y,
  }))
}

export function collides(board: Board, piece: ActivePiece): boolean {
  return occupiedCells(piece).some(
    ({ x, y }) =>
      x < 0 ||
      x >= BOARD_WIDTH ||
      y >= BOARD_HEIGHT ||
      (y >= 0 && board[y][x] !== null),
  )
}

function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: spawnColumn(type, BOARD_WIDTH), y: 0 }
}

/** Hvor brikken ville lande, hvis den faldt lige ned herfra. */
export function ghostPiece(board: Board, piece: ActivePiece): ActivePiece {
  let landed = piece
  while (!collides(board, { ...landed, y: landed.y + 1 })) {
    landed = { ...landed, y: landed.y + 1 }
  }
  return landed
}

export function gravityIntervalMs(level: number): number {
  const step = Math.max(0, Math.min(MAX_LEVEL, level) - 1)
  const seconds = (0.8 - step * 0.007) ** step
  return Math.max(MIN_GRAVITY_MS, seconds * 1000)
}

export function levelForLines(lines: number): number {
  return Math.min(MAX_LEVEL, Math.floor(lines / LINES_PER_LEVEL) + 1)
}

export function createGame(): TetrisState {
  return {
    board: createBoard(),
    active: null,
    next: [],
    bag: [],
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    backToBack: false,
    status: 'idle',
    lastEvent: null,
    gravityElapsed: 0,
    lockElapsed: null,
    lockResets: 0,
    rotatedLast: false,
    lastKick: 0,
    elapsedMs: 0,
  }
}

export function startGame(rng: RandomSource = Math.random): TetrisState {
  const base = createGame()
  const { next, bag } = fillQueue([], [], rng)
  const [first, ...rest] = next
  const filled = fillQueue(rest, bag, rng)
  const active = spawnPiece(first)

  return {
    ...base,
    status: 'running',
    active,
    next: filled.next,
    bag: filled.bag,
  }
}

/**
 * Tag den næste brik ind på brættet. Går den ikke ind, er spillet slut --
 * "block out", den klassiske slutning på et parti Tetris.
 */
function nextTurn(state: TetrisState, rng: RandomSource): TetrisState {
  const [upcoming, ...rest] = state.next
  const filled = fillQueue(rest, state.bag, rng)
  const active = spawnPiece(upcoming)

  const spawned: TetrisState = {
    ...state,
    active,
    next: filled.next,
    bag: filled.bag,
    holdUsed: false,
    gravityElapsed: 0,
    lockElapsed: null,
    lockResets: 0,
    rotatedLast: false,
    lastKick: 0,
  }

  if (collides(state.board, active)) {
    return { ...spawned, active: null, status: 'over' }
  }
  return spawned
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell === null))
  const cleared = board.length - kept.length
  if (cleared === 0) return { board, cleared }

  const empty = Array.from({ length: cleared }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null as Cell),
  )
  return { board: [...empty, ...kept], cleared }
}

const CORNERS: readonly Coordinate[] = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: 2 },
  { x: 2, y: 2 },
]

/** Hjørnerne, T-brikkens flade side vender imod, pr. drejning. */
const FRONT_CORNERS: Record<Rotation, readonly [number, number]> = {
  0: [0, 1],
  1: [1, 3],
  2: [2, 3],
  3: [0, 2],
}

function isBlocked(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return true
  // Over brættets top er der ingenting -- ikke en væg.
  if (y < 0) return false
  return board[y][x] !== null
}

/**
 * Trehjørnereglen: en T-brik, der er drejet på plads i et hul med mindst tre
 * optagne hjørner, tæller som T-spin. Er begge hjørner på brikkens flade side
 * optaget, er den "fuld" -- ellers en mini, medmindre drejningen brugte den
 * femte og mest yderliggående kick-forskydning.
 */
function detectTSpin(state: TetrisState, piece: ActivePiece): TSpin {
  if (piece.type !== 'T' || !state.rotatedLast) return 'none'

  const occupied = CORNERS.map((corner) =>
    isBlocked(state.board, piece.x + corner.x, piece.y + corner.y),
  )
  if (occupied.filter(Boolean).length < 3) return 'none'

  const [frontA, frontB] = FRONT_CORNERS[piece.rotation]
  if (occupied[frontA] && occupied[frontB]) return 'full'
  return state.lastKick === 4 ? 'full' : 'mini'
}

const LINE_POINTS = [0, 100, 300, 500, 800] as const
const T_SPIN_POINTS = [400, 800, 1200, 1600] as const
const T_SPIN_MINI_POINTS = [100, 200, 400, 400] as const

export function clearPoints(
  cleared: number,
  tSpin: TSpin,
  level: number,
): number {
  if (tSpin === 'full') return T_SPIN_POINTS[cleared] * level
  if (tSpin === 'mini') return T_SPIN_MINI_POINTS[cleared] * level
  return LINE_POINTS[cleared] * level
}

/** Tetris og T-spins tæller som "svære" og kan kædes sammen for 50 % oveni. */
function isDifficult(cleared: number, tSpin: TSpin): boolean {
  return cleared > 0 && (cleared === 4 || tSpin !== 'none')
}

/**
 * Lås brikken fast, ryd de fulde rækker, læg pointene sammen og tag den næste
 * brik ind.
 */
export function lockPiece(
  state: TetrisState,
  rng: RandomSource = Math.random,
): TetrisState {
  const piece = state.active
  if (!piece || state.status !== 'running') return state

  const tSpin = detectTSpin(state, piece)
  const cells = occupiedCells(piece)

  const board = state.board.map((row) => [...row])
  for (const { x, y } of cells) {
    if (y >= 0 && y < BOARD_HEIGHT) board[y][x] = piece.type
  }

  const { board: cleared, cleared: clearedCount } = clearLines(board)

  const difficult = isDifficult(clearedCount, tSpin)
  const chained = difficult && state.backToBack
  const combo = clearedCount > 0 ? state.combo + 1 : -1
  const level = state.level

  const base = clearPoints(clearedCount, tSpin, level)
  const points =
    Math.floor(chained ? base * 1.5 : base) +
    (combo > 0 ? 50 * combo * level : 0)

  const lines = state.lines + clearedCount
  // "Lock out": lander hele brikken over brættets kant, er spillet slut.
  const lockedOut = cells.every(({ y }) => y < HIDDEN_HEIGHT)

  const locked: TetrisState = {
    ...state,
    board: cleared,
    active: null,
    score: state.score + points,
    lines,
    level: levelForLines(lines),
    combo,
    backToBack: clearedCount > 0 ? difficult : state.backToBack,
    lastEvent:
      clearedCount > 0 || tSpin !== 'none'
        ? {
            lines: clearedCount,
            tSpin,
            combo: combo > 0 ? combo : 0,
            backToBack: chained,
            points,
          }
        : null,
  }

  if (lockedOut) return { ...locked, status: 'over' }
  return nextTurn(locked, rng)
}

function withMovedPiece(
  state: TetrisState,
  piece: ActivePiece,
  rotated: boolean,
  kick = 0,
): TetrisState {
  const grounded = collides(state.board, { ...piece, y: piece.y + 1 })
  const wasGrounded = state.lockElapsed !== null
  // Et træk nulstiller låseuret -- men kun så længe der er nulstillinger
  // tilbage. Ellers kunne brikken danse på bunden i det uendelige.
  const resets =
    grounded && wasGrounded && state.lockResets < MAX_LOCK_RESETS
      ? state.lockResets + 1
      : state.lockResets
  const lockElapsed = grounded
    ? wasGrounded && state.lockResets >= MAX_LOCK_RESETS
      ? state.lockElapsed
      : 0
    : null

  return {
    ...state,
    active: piece,
    lockElapsed,
    lockResets: resets,
    rotatedLast: rotated,
    lastKick: rotated ? kick : state.lastKick,
  }
}

export function move(state: TetrisState, dx: number): TetrisState {
  if (state.status !== 'running' || !state.active) return state
  const moved = { ...state.active, x: state.active.x + dx }
  if (collides(state.board, moved)) return state
  return withMovedPiece(state, moved, false)
}

export function rotate(state: TetrisState, direction: 1 | -1): TetrisState {
  if (state.status !== 'running' || !state.active) return state
  const from = state.active.rotation
  const to = ((((from + direction) % 4) + 4) % 4) as Rotation
  const offsets = kickOffsets(state.active.type, from, to)

  for (let index = 0; index < offsets.length; index += 1) {
    const candidate: ActivePiece = {
      ...state.active,
      rotation: to,
      x: state.active.x + offsets[index].x,
      y: state.active.y + offsets[index].y,
    }
    if (!collides(state.board, candidate)) {
      return withMovedPiece(state, candidate, true, index)
    }
  }
  return state
}

/** Ét trin ned, valgt af spilleren. Giver et point, som et blødt fald skal. */
export function softDrop(state: TetrisState): TetrisState {
  if (state.status !== 'running' || !state.active) return state
  const moved = { ...state.active, y: state.active.y + 1 }
  if (collides(state.board, moved)) {
    // Brikken står allerede på bunden: start låseuret frem for ingenting.
    return { ...state, lockElapsed: state.lockElapsed ?? 0 }
  }
  return {
    ...withMovedPiece(state, moved, false),
    score: state.score + 1,
    gravityElapsed: 0,
  }
}

export function hardDrop(
  state: TetrisState,
  rng: RandomSource = Math.random,
): TetrisState {
  if (state.status !== 'running' || !state.active) return state
  const landed = ghostPiece(state.board, state.active)
  const distance = landed.y - state.active.y

  return lockPiece(
    {
      ...state,
      active: landed,
      score: state.score + distance * 2,
      // Et hårdt fald er ikke en drejning: en T-spin kan ikke opstå af det.
      rotatedLast: distance > 0 ? false : state.rotatedLast,
    },
    rng,
  )
}

export function holdPiece(
  state: TetrisState,
  rng: RandomSource = Math.random,
): TetrisState {
  if (state.status !== 'running' || !state.active || state.holdUsed) {
    return state
  }

  const stored = state.active.type
  if (state.hold === null) {
    const swapped = nextTurn({ ...state, hold: stored }, rng)
    return { ...swapped, holdUsed: true }
  }

  const active = spawnPiece(state.hold)
  const swapped: TetrisState = {
    ...state,
    hold: stored,
    active,
    holdUsed: true,
    gravityElapsed: 0,
    lockElapsed: null,
    lockResets: 0,
    rotatedLast: false,
    lastKick: 0,
  }
  if (collides(state.board, active)) {
    return { ...swapped, active: null, status: 'over' }
  }
  return swapped
}

export function togglePause(state: TetrisState): TetrisState {
  if (state.status === 'running') return { ...state, status: 'paused' }
  if (state.status === 'paused') return { ...state, status: 'running' }
  return state
}

/**
 * Lad der gå `deltaMs` i spillet: tyngdekraften trækker brikken ned, og hviler
 * den på bunden, tælles der ned til låsning. Tiden kommer udefra, så et helt
 * parti kan spilles igennem i en test uden at vente på et eneste sekund.
 */
export function tick(
  state: TetrisState,
  deltaMs: number,
  rng: RandomSource = Math.random,
): TetrisState {
  if (state.status !== 'running' || !state.active) return state

  let current: TetrisState = {
    ...state,
    elapsedMs: state.elapsedMs + deltaMs,
  }
  const interval = gravityIntervalMs(current.level)
  let remaining = deltaMs

  // Ved høje niveauer kan der være plads til flere trin i ét billede.
  while (remaining > 0 && current.status === 'running' && current.active) {
    const grounded = collides(current.board, {
      ...current.active,
      y: current.active.y + 1,
    })

    if (grounded) {
      const elapsed = (current.lockElapsed ?? 0) + remaining
      if (elapsed < LOCK_DELAY_MS) {
        return { ...current, lockElapsed: elapsed, gravityElapsed: 0 }
      }
      remaining = elapsed - LOCK_DELAY_MS
      current = lockPiece({ ...current, lockElapsed: null }, rng)
      continue
    }

    const gravity = current.gravityElapsed + remaining
    if (gravity < interval) {
      return { ...current, gravityElapsed: gravity, lockElapsed: null }
    }
    remaining = gravity - interval
    current = {
      ...current,
      active: { ...current.active, y: current.active.y + 1 },
      gravityElapsed: 0,
      lockElapsed: null,
      rotatedLast: false,
    }
  }

  return current
}
