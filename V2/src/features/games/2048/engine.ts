/**
 * 2048 -- uden React og uden tilfældighed, der ikke er givet udefra.
 *
 * Alt her er rene funktioner: `move(state, retning, rng)` tager en tilstand
 * og giver en ny. Den nye brik trækkes fra en `rng`, kaldebeslutningen sender
 * med, så et helt parti kan spilles igennem i en test uden at gætte på et
 * terningkast. Reglerne er de klassiske: skub alle brikker til én side, to ens
 * brikker, der støder sammen, bliver til én med den dobbelte værdi og giver
 * den værdi i point, og en brik, der lige er lagt sammen, lægges ikke sammen
 * igen i samme træk.
 */

export const BOARD_SIZE = 4

/** Ni ud af ti nye brikker er en 2'er, resten en 4'er -- som i originalen. */
export const FOUR_CHANCE = 0.1

/** Brikken, spillet er opkaldt efter. Man må gerne spille videre bagefter. */
export const WIN_TILE = 2048

export type Direction = 'up' | 'down' | 'left' | 'right'
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** 0 er et tomt felt; ellers en toerpotens fra 2 og op. */
export type Cell = number
export type Board = readonly (readonly Cell[])[]

export type GameStatus = 'idle' | 'running' | 'over'

export interface Game2048State {
  board: Board
  score: number
  /** Antal træk, der flyttede noget. Et skub mod en væg tæller ikke. */
  moves: number
  status: GameStatus
  /** Sandt fra det øjeblik, en 2048-brik er lagt -- og forbliver det. */
  won: boolean
  /** Feltet, det seneste træk lagde en ny brik på, så det kan tegnes ind. */
  spawned: { row: number; col: number } | null
  /** Felterne, det seneste træk lagde sammen, så de kan bumpe. */
  merged: readonly { row: number; col: number }[]
}

export type RandomSource = () => number

export function createBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 0),
  )
}

export function createGame(): Game2048State {
  return {
    board: createBoard(),
    score: 0,
    moves: 0,
    status: 'idle',
    won: false,
    spawned: null,
    merged: [],
  }
}

function emptyCells(board: Board): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = []
  board.forEach((cells_, row) =>
    cells_.forEach((cell, col) => {
      if (cell === 0) cells.push({ row, col })
    }),
  )
  return cells
}

/**
 * Læg en ny brik på et tilfældigt tomt felt. `rng` bruges to gange: først til
 * feltet, så til om det bliver en 2'er eller en 4'er. Er brættet fuldt, sker
 * der ingenting.
 */
export function spawnTile(
  board: Board,
  rng: RandomSource = Math.random,
): { board: Board; spawned: { row: number; col: number } | null } {
  const empty = emptyCells(board)
  if (empty.length === 0) return { board, spawned: null }

  const target =
    empty[Math.min(empty.length - 1, Math.floor(rng() * empty.length))]
  const value = rng() < FOUR_CHANCE ? 4 : 2
  const next = board.map((row, r) =>
    r === target.row
      ? row.map((cell, c) => (c === target.col ? value : cell))
      : row,
  )
  return { board: next, spawned: target }
}

/**
 * Skub én linje mod venstre: tomme felter falder ud, to ens naboer bliver til
 * én. `mergedAt` er pladserne i den skubbede linje, der opstod af en
 * sammenlægning -- de skal ikke lægges sammen igen i samme træk, og de skal
 * kunne tegnes med et bump.
 */
export function slideLine(line: readonly Cell[]): {
  line: Cell[]
  gained: number
  mergedAt: number[]
} {
  const packed = line.filter((cell) => cell !== 0)
  const result: Cell[] = []
  const mergedAt: number[] = []
  let gained = 0

  for (let index = 0; index < packed.length; index += 1) {
    const current = packed[index]
    const following = packed[index + 1]
    if (following !== undefined && following === current) {
      result.push(current * 2)
      gained += current * 2
      mergedAt.push(result.length - 1)
      index += 1
    } else {
      result.push(current)
    }
  }

  while (result.length < line.length) result.push(0)
  return { line: result, gained, mergedAt }
}

/**
 * Brættet læst som linjer i trækkets retning, så alle fire retninger kan
 * bruge samme `slideLine`. Hver linje er en liste af koordinater, hvor det
 * første er dét felt, brikkerne skubbes hen imod.
 */
function lines(direction: Direction): { row: number; col: number }[][] {
  const indices = Array.from({ length: BOARD_SIZE }, (_, index) => index)
  switch (direction) {
    case 'left':
      return indices.map((row) => indices.map((col) => ({ row, col })))
    case 'right':
      return indices.map((row) =>
        indices.map((col) => ({ row, col: BOARD_SIZE - 1 - col })),
      )
    case 'up':
      return indices.map((col) => indices.map((row) => ({ row, col })))
    case 'down':
      return indices.map((col) =>
        indices.map((row) => ({ row: BOARD_SIZE - 1 - row, col })),
      )
  }
}

/** Selve skubbet, uden ny brik: så det kan testes -- og bruges til game-over. */
export function slideBoard(
  board: Board,
  direction: Direction,
): {
  board: Board
  gained: number
  moved: boolean
  merged: { row: number; col: number }[]
} {
  const next = board.map((row) => [...row])
  const merged: { row: number; col: number }[] = []
  let gained = 0
  let moved = false

  for (const line of lines(direction)) {
    const values = line.map(({ row, col }) => board[row][col])
    const slid = slideLine(values)
    gained += slid.gained
    line.forEach(({ row, col }, index) => {
      if (next[row][col] !== slid.line[index]) moved = true
      next[row][col] = slid.line[index]
    })
    for (const index of slid.mergedAt) merged.push(line[index])
  }

  return { board: next, gained, moved, merged }
}

export function highestTile(board: Board): number {
  return board.reduce(
    (best, row) => row.reduce((rowBest, cell) => Math.max(rowBest, cell), best),
    0,
  )
}

/** Ingen tomme felter og ingen to ens naboer: så er der ikke flere træk. */
export function hasMoves(board: Board): boolean {
  return DIRECTIONS.some((direction) => slideBoard(board, direction).moved)
}

export function startGame(rng: RandomSource = Math.random): Game2048State {
  const first = spawnTile(createBoard(), rng)
  const second = spawnTile(first.board, rng)
  return {
    ...createGame(),
    board: second.board,
    status: 'running',
    spawned: second.spawned,
  }
}

/**
 * Ét træk: skub, læg sammen, læg en ny brik -- og se, om der er flere træk
 * tilbage. Et skub, der ikke flytter noget, er ikke et træk: der kommer ingen
 * ny brik, og tilstanden gives uændret tilbage.
 */
export function move(
  state: Game2048State,
  direction: Direction,
  rng: RandomSource = Math.random,
): Game2048State {
  if (state.status !== 'running') return state

  const slid = slideBoard(state.board, direction)
  if (!slid.moved) return state

  const { board, spawned } = spawnTile(slid.board, rng)
  const won = state.won || highestTile(board) >= WIN_TILE

  return {
    ...state,
    board,
    score: state.score + slid.gained,
    moves: state.moves + 1,
    won,
    spawned,
    merged: slid.merged,
    status: hasMoves(board) ? 'running' : 'over',
  }
}
