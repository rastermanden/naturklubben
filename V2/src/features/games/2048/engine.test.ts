import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  WIN_TILE,
  createGame,
  hasMoves,
  highestTile,
  move,
  slideBoard,
  slideLine,
  spawnTile,
  startGame,
  type Board,
  type Game2048State,
} from './engine'

/**
 * En fast terning. `spawnTile` kaster to gange -- først om feltet, så om
 * værdien -- så en terning, der skiftevis giver 0 og 0,5, lægger altid en
 * 2'er på det første tomme felt.
 */
function fixedRng() {
  fixedRng.calls += 1
  return fixedRng.calls % 2 === 1 ? 0 : 0.5
}
fixedRng.calls = 0

beforeEach(() => {
  fixedRng.calls = 0
})

/** Et parti midt i spillet med præcis det bræt, testen har brug for. */
function gameWith(board: Board, overrides: Partial<Game2048State> = {}) {
  return { ...createGame(), status: 'running' as const, board, ...overrides }
}

describe('slideLine', () => {
  it('skubber brikkerne sammen mod starten af linjen', () => {
    expect(slideLine([0, 2, 0, 4]).line).toEqual([2, 4, 0, 0])
  })

  it('lægger to ens naboer sammen og giver værdien i point', () => {
    const slid = slideLine([2, 2, 0, 0])
    expect(slid.line).toEqual([4, 0, 0, 0])
    expect(slid.gained).toBe(4)
    expect(slid.mergedAt).toEqual([0])
  })

  it('lægger sammen hen over tomme felter', () => {
    expect(slideLine([2, 0, 0, 2]).line).toEqual([4, 0, 0, 0])
  })

  it('lægger kun sammen én gang pr. brik i samme træk', () => {
    // 4 4 2 2 skal blive 8 4, ikke 16 -- og 2 2 2 skal blive 4 2, ikke 2 4.
    expect(slideLine([4, 4, 2, 2]).line).toEqual([8, 4, 0, 0])
    expect(slideLine([2, 2, 2, 0]).line).toEqual([4, 2, 0, 0])
    expect(slideLine([2, 2, 2, 2]).line).toEqual([4, 4, 0, 0])
    expect(slideLine([2, 2, 2, 2]).gained).toBe(8)
  })

  it('lader en linje være, der ikke kan skubbes', () => {
    expect(slideLine([2, 4, 2, 4]).line).toEqual([2, 4, 2, 4])
    expect(slideLine([2, 4, 2, 4]).gained).toBe(0)
  })
})

describe('slideBoard i de fire retninger', () => {
  const board: Board = [
    [2, 0, 0, 2],
    [0, 4, 4, 0],
    [0, 0, 0, 0],
    [2, 0, 0, 2],
  ]

  it('venstre', () => {
    expect(slideBoard(board, 'left').board).toEqual([
      [4, 0, 0, 0],
      [8, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 0, 0, 0],
    ])
  })

  it('højre', () => {
    expect(slideBoard(board, 'right').board).toEqual([
      [0, 0, 0, 4],
      [0, 0, 0, 8],
      [0, 0, 0, 0],
      [0, 0, 0, 4],
    ])
  })

  it('op', () => {
    expect(slideBoard(board, 'up').board).toEqual([
      [4, 4, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
  })

  it('ned', () => {
    expect(slideBoard(board, 'down').board).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 4, 4, 4],
    ])
  })

  it('tæller pointene sammen og ved, om noget flyttede sig', () => {
    const slid = slideBoard(board, 'left')
    expect(slid.gained).toBe(16)
    expect(slid.moved).toBe(true)
    expect(slid.merged).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 3, col: 0 },
    ])
  })

  it('melder, at ingenting flyttede sig, når skubbet går mod en væg', () => {
    const packed: Board = [
      [2, 4, 0, 0],
      [8, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    expect(slideBoard(packed, 'left').moved).toBe(false)
    expect(slideBoard(packed, 'right').moved).toBe(true)
  })
})

describe('spawnTile', () => {
  it('lægger en ny brik på et tomt felt, styret af terningen', () => {
    const board: Board = [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    // Første kast vælger blandt de tolv tomme felter, andet vælger værdien.
    const draws = [5 / 12, 0.5]
    const spawned = spawnTile(board, () => draws.shift() ?? 0)

    expect(spawned.spawned).toEqual({ row: 2, col: 1 })
    expect(spawned.board[2][1]).toBe(2)
    // Den øverste række er urørt.
    expect(spawned.board[0]).toEqual([2, 4, 8, 16])
  })

  it('giver en 4-er, når terningen falder i den nederste tiendedel', () => {
    const draws = [0, 0.05]
    const spawned = spawnTile(createGame().board, () => draws.shift() ?? 0)
    expect(spawned.board[0][0]).toBe(4)
  })

  it('gør ingenting på et fuldt bræt', () => {
    const full: Board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => 2),
    )
    const spawned = spawnTile(full, fixedRng)
    expect(spawned.board).toBe(full)
    expect(spawned.spawned).toBeNull()
  })
})

describe('startGame', () => {
  it('begynder med to brikker på brættet', () => {
    const state = startGame(Math.random)
    const tiles = state.board.flat().filter((cell) => cell !== 0)
    expect(tiles).toHaveLength(2)
    expect(tiles.every((tile) => tile === 2 || tile === 4)).toBe(true)
    expect(state.status).toBe('running')
    expect(state.score).toBe(0)
    expect(state.moves).toBe(0)
  })
})

describe('move', () => {
  it('skubber, lægger en ny brik og tæller trækket', () => {
    const state = gameWith([
      [0, 0, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])

    const moved = move(state, 'left', fixedRng)

    expect(moved.board[0][0]).toBe(4)
    expect(moved.score).toBe(4)
    expect(moved.moves).toBe(1)
    // Terningen på 0 lægger den nye brik på det første tomme felt.
    expect(moved.spawned).toEqual({ row: 0, col: 1 })
    expect(moved.board[0][1]).toBe(2)
    expect(moved.merged).toEqual([{ row: 0, col: 0 }])
    expect(moved.status).toBe('running')
  })

  it('er ikke et træk, hvis ingenting flytter sig', () => {
    const state = gameWith([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])

    expect(move(state, 'left', fixedRng)).toBe(state)
    expect(move(state, 'up', fixedRng)).toBe(state)
  })

  it('gør ingenting, når spillet ikke er i gang', () => {
    const idle = createGame()
    expect(move(idle, 'left', fixedRng)).toBe(idle)
  })

  it('husker, at 2048 er nået, men lader spillet fortsætte', () => {
    const state = gameWith([
      [WIN_TILE / 2, WIN_TILE / 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])

    const moved = move(state, 'left', fixedRng)

    expect(moved.won).toBe(true)
    expect(moved.status).toBe('running')
    expect(highestTile(moved.board)).toBe(WIN_TILE)
  })
})

describe('game over', () => {
  const stuck: Board = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 8],
  ]

  it('ser, at et bræt uden tomme felter og uden ens naboer er kørt fast', () => {
    expect(hasMoves(stuck)).toBe(false)
  })

  it('ser stadig et træk, når to ens brikker står ved siden af hinanden', () => {
    const board = stuck.map((row) => [...row])
    board[3][3] = 4
    expect(hasMoves(board)).toBe(true)
  })

  it('slutter spillet, når den nye brik fylder det sidste felt uden træk', () => {
    // Det sidste tomme felt ligger i hjørnet; skubbes nederste række til
    // højre, lander 8'eren dér, og terningen lægger en 2'er i hullet ved
    // siden af 4'eren ovenover -- ingen ens naboer tilbage.
    const state = gameWith([
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [4, 2, 8, 0],
    ])

    const moved = move(state, 'right', fixedRng)

    expect(moved.board[3]).toEqual([2, 4, 2, 8])
    expect(moved.status).toBe('over')
  })
})
