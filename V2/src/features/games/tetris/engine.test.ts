import { describe, expect, it } from 'vitest'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  createBoard,
  createGame,
  gravityIntervalMs,
  ghostPiece,
  hardDrop,
  holdPiece,
  levelForLines,
  lockPiece,
  move,
  rotate,
  softDrop,
  startGame,
  tick,
  togglePause,
  type Board,
  type Cell,
  type TetrisState,
} from './engine'
import { PIECE_TYPES, type PieceType } from './pieces'

/** En fast terning: `() => 0` giver altid samme pose, så et parti kan gentages. */
const fixedRng = () => 0

/**
 * Byg et bræt af tegninger, nederste række sidst. `#` er en fyldt celle.
 * Farven er uden betydning for reglerne, så alt bliver til I-celler.
 */
function boardFromRows(rows: readonly string[]): Board {
  const board: Cell[][] = createBoard().map((row) => [...row])
  rows.forEach((drawing, index) => {
    const y = BOARD_HEIGHT - rows.length + index
    for (let x = 0; x < drawing.length; x += 1) {
      if (drawing[x] === '#') board[y][x] = 'I'
    }
  })
  return board
}

/** Et parti midt i spillet med præcis den brik og det bræt, testen har brug for. */
function gameWith(
  overrides: Partial<TetrisState> & { active: TetrisState['active'] },
): TetrisState {
  return {
    ...createGame(),
    status: 'running',
    next: ['I', 'J', 'L', 'O', 'S'],
    bag: ['T', 'Z'],
    ...overrides,
  }
}

/** Hvor mange fyldte celler brættet har -- en billig måde at se en låsning. */
function filledCells(board: Board): number {
  return board.reduce(
    (total, row) => total + row.filter((cell) => cell !== null).length,
    0,
  )
}

describe('posen med brikker', () => {
  it('giver alle syv brikker, før nogen af dem kommer igen', () => {
    let state = startGame(Math.random)
    const drawn: PieceType[] = []

    // Første brik er allerede på brættet; resten står i køen og posen.
    drawn.push(state.active!.type)
    while (drawn.length < 14) {
      // Brættet tømmes mellem brikkerne: testen handler om posen, ikke om at
      // overleve fjorten brikker oven på hinanden i samme kolonne.
      state = hardDrop({ ...state, board: createBoard() }, Math.random)
      drawn.push(state.active!.type)
    }

    expect(new Set(drawn.slice(0, 7)).size).toBe(7)
    expect(new Set(drawn.slice(7, 14)).size).toBe(7)
    expect([...drawn].sort()).toEqual([...PIECE_TYPES, ...PIECE_TYPES].sort())
  })

  it('viser fem kommende brikker fra start', () => {
    const state = startGame(fixedRng)
    expect(state.next).toHaveLength(5)
    expect(state.active).not.toBeNull()
    expect(state.status).toBe('running')
  })
})

describe('flytning og drejning', () => {
  it('lader brikken flytte sig, men ikke gennem væggen', () => {
    const state = gameWith({ active: { type: 'O', rotation: 0, x: 0, y: 0 } })

    expect(move(state, 1).active!.x).toBe(1)
    // O-brikkens celler starter en kolonne inde i rammen, så x = -1 er stadig
    // inde på brættet; x = -2 er ikke.
    expect(move(move(state, -1), -1).active!.x).toBe(-1)
  })

  it('bruger SRS-forskydninger til at dreje en I-brik fri af væggen', () => {
    // Lodret I helt ude ved venstre kant: en almindelig drejning ville lægge
    // brikken uden for brættet, så kick-tabellen skal flytte den ind.
    const state = gameWith({
      active: { type: 'I', rotation: 1, x: -2, y: 10 },
    })

    const rotated = rotate(state, -1)

    expect(rotated.active!.rotation).toBe(0)
    // Anden forskydning i tabellen -- to til højre -- er den første, der går.
    expect(rotated.active!.x).toBe(0)
    expect(rotated.active!.y).toBe(10)
  })

  it('lader drejningen være, når ingen forskydning passer', () => {
    // Alt er muret til på nær præcis de fire celler, T-brikken står i.
    const rows = Array.from({ length: BOARD_HEIGHT }, () =>
      '##########'.split(''),
    )
    for (const [x, y] of [
      [4, 18],
      [3, 19],
      [4, 19],
      [5, 19],
    ]) {
      rows[y][x] = '.'
    }
    const state = gameWith({
      board: boardFromRows(rows.map((row) => row.join(''))),
      active: { type: 'T', rotation: 0, x: 3, y: 18 },
    })

    expect(rotate(state, 1)).toEqual(state)
    expect(rotate(state, -1)).toEqual(state)
  })
})

describe('skyggen og det hårde fald', () => {
  it('viser hvor brikken lander', () => {
    const board = boardFromRows(['##########'])
    const state = gameWith({
      board,
      active: { type: 'O', rotation: 0, x: 3, y: 0 },
    })

    // Nederste række er fyldt, så O-brikkens to rækker slutter lige over den.
    expect(ghostPiece(board, state.active!).y).toBe(BOARD_HEIGHT - 3)
  })

  it('giver to point pr. række, brikken falder', () => {
    const state = gameWith({ active: { type: 'O', rotation: 0, x: 3, y: 0 } })

    const dropped = hardDrop(state, fixedRng)

    // O ligger i rammens række 0-1, så faldet er hele brættet minus to rækker.
    expect(dropped.score).toBe((BOARD_HEIGHT - 2) * 2)
    expect(filledCells(dropped.board)).toBe(4)
  })

  it('giver ét point pr. blødt trin ned', () => {
    const state = gameWith({ active: { type: 'O', rotation: 0, x: 3, y: 0 } })

    const dropped = softDrop(softDrop(state))

    expect(dropped.score).toBe(2)
    expect(dropped.active!.y).toBe(2)
  })
})

describe('rækker og point', () => {
  it('rydder de fulde rækker og lægger pointene til', () => {
    // De to nederste rækker mangler netop de to celler, O-brikken fylder.
    const board = boardFromRows(['########..', '########..'])
    const state = gameWith({
      board,
      active: { type: 'O', rotation: 0, x: 7, y: 0 },
    })

    const locked = hardDrop(state, fixedRng)

    expect(locked.lines).toBe(2)
    expect(locked.lastEvent?.lines).toBe(2)
    // 300 for de to rækker plus 2 point for hver af de 20 rækker, brikken faldt.
    expect(locked.score).toBe(340)
    expect(filledCells(locked.board)).toBe(0)
    expect(locked.active!.type).toBe('I')
  })

  it('giver 800 point for en Tetris og 50 % oveni for den næste i træk', () => {
    function tetrisState(previous?: TetrisState): TetrisState {
      const board = boardFromRows([
        '.#########',
        '.#########',
        '.#########',
        '.#########',
      ])
      return gameWith({
        board,
        active: { type: 'I', rotation: 1, x: -2, y: BOARD_HEIGHT - 4 },
        score: 0,
        backToBack: previous?.backToBack ?? false,
        combo: -1,
      })
    }

    const first = lockPiece(tetrisState(), fixedRng)
    expect(first.lastEvent?.lines).toBe(4)
    expect(first.lastEvent?.points).toBe(800)
    expect(first.backToBack).toBe(true)

    const second = lockPiece(tetrisState(first), fixedRng)
    expect(second.lastEvent?.points).toBe(1200)
    expect(second.lastEvent?.backToBack).toBe(true)
  })

  it('lægger en kædebonus til, når to brikker i træk rydder', () => {
    const board = boardFromRows(['########..'])
    const state = gameWith({
      board,
      // combo 0 betyder, at forrige brik ryddede: denne er nummer to i kæden.
      combo: 0,
      active: { type: 'O', rotation: 0, x: 7, y: BOARD_HEIGHT - 2 },
    })

    const locked = lockPiece(state, fixedRng)

    // 100 for den enkelte række plus 50 x 1 x niveau 1 for kæden.
    expect(locked.lastEvent?.combo).toBe(1)
    expect(locked.lastEvent?.points).toBe(150)
  })

  it('kender en T-spin, når T-brikken drejes ned i et hul', () => {
    const board = boardFromRows(['..#..#....', '##...#####', '###.######'])
    const state = gameWith({
      board,
      active: { type: 'T', rotation: 3, x: 3, y: BOARD_HEIGHT - 4 },
    })

    // Hverken den lige drejning eller den til venstre passer -- først den
    // tredje forskydning, som skubber brikken ned i hullet.
    const rotated = rotate(state, -1)
    expect(rotated.active!.rotation).toBe(2)
    expect(rotated.active!.y).toBe(BOARD_HEIGHT - 3)
    expect(rotated.rotatedLast).toBe(true)

    const locked = lockPiece(rotated, fixedRng)

    expect(locked.lastEvent?.tSpin).toBe('full')
    expect(locked.lastEvent?.lines).toBe(2)
    expect(locked.lastEvent?.points).toBe(1200)
  })

  it('giver ikke T-spin for det samme hul, når brikken bare falder derned', () => {
    // Præcis samme slutposition som testen ovenfor -- men uden en drejning
    // umiddelbart før. Så er det to almindelige rækker, ikke en T-spin.
    const board = boardFromRows(['..#..#....', '##...#####', '###.######'])
    const state = gameWith({
      board,
      active: { type: 'T', rotation: 2, x: 2, y: BOARD_HEIGHT - 3 },
      rotatedLast: false,
    })

    const locked = lockPiece(state, fixedRng)

    expect(locked.lastEvent?.tSpin).toBe('none')
    expect(locked.lastEvent?.lines).toBe(2)
    expect(locked.lastEvent?.points).toBe(300)
  })
})

describe('niveau og tyngdekraft', () => {
  it('stiger et niveau for hver tiende række', () => {
    expect(levelForLines(0)).toBe(1)
    expect(levelForLines(9)).toBe(1)
    expect(levelForLines(10)).toBe(2)
    expect(levelForLines(95)).toBe(10)
  })

  it('falder hurtigere på højere niveauer, men aldrig hurtigere end bunden', () => {
    expect(gravityIntervalMs(1)).toBeGreaterThan(gravityIntervalMs(5))
    expect(gravityIntervalMs(5)).toBeGreaterThan(gravityIntervalMs(9))
    expect(gravityIntervalMs(20)).toBeGreaterThanOrEqual(60)
  })

  it('trækker brikken ned, når intervallet er gået', () => {
    const state = gameWith({ active: { type: 'O', rotation: 0, x: 3, y: 0 } })
    const interval = gravityIntervalMs(1)

    expect(tick(state, interval - 1).active!.y).toBe(0)
    expect(tick(state, interval).active!.y).toBe(1)
    expect(tick(state, interval * 3).active!.y).toBe(3)
  })

  it('lader tiden stå stille, når spillet er sat på pause', () => {
    const state = togglePause(
      gameWith({ active: { type: 'O', rotation: 0, x: 3, y: 0 } }),
    )

    expect(state.status).toBe('paused')
    expect(tick(state, 10_000)).toEqual(state)
    expect(togglePause(state).status).toBe('running')
  })
})

describe('låsning på bunden', () => {
  function grounded(): TetrisState {
    return gameWith({
      board: boardFromRows(['##########']),
      active: { type: 'O', rotation: 0, x: 3, y: BOARD_HEIGHT - 3 },
    })
  }

  it('venter et halvt sekund, før brikken låses fast', () => {
    const waiting = tick(grounded(), LOCK_DELAY_MS - 1)
    expect(waiting.active!.y).toBe(BOARD_HEIGHT - 3)
    expect(filledCells(waiting.board)).toBe(BOARD_WIDTH)

    const locked = tick(waiting, 1)
    // Den fyldte række ryger med det samme, så kun O-brikkens fire celler står
    // tilbage.
    expect(locked.lines).toBe(1)
    expect(filledCells(locked.board)).toBe(4)
  })

  it('udskyder låsningen, når brikken flyttes -- men ikke i det uendelige', () => {
    let state = tick(grounded(), LOCK_DELAY_MS - 1)

    for (let attempt = 0; attempt < MAX_LOCK_RESETS; attempt += 1) {
      state = move(state, attempt % 2 === 0 ? -1 : 1)
      expect(state.lockElapsed).toBe(0)
      state = tick(state, LOCK_DELAY_MS - 1)
      expect(state.active).not.toBeNull()
    }

    // Nulstillingerne er brugt op: næste træk udskyder ikke længere noget.
    state = move(state, -1)
    expect(state.lockElapsed).toBe(LOCK_DELAY_MS - 1)
    expect(tick(state, 1).active!.type).not.toBe('O')
  })
})

describe('den gemte brik', () => {
  it('bytter den aktive brik ud og kan først bruges igen næste gang', () => {
    const state = gameWith({ active: { type: 'T', rotation: 0, x: 3, y: 0 } })

    const held = holdPiece(state, fixedRng)
    expect(held.hold).toBe('T')
    expect(held.active!.type).toBe('I')
    expect(held.holdUsed).toBe(true)

    // Andet forsøg med samme brik gør ingenting.
    expect(holdPiece(held, fixedRng)).toEqual(held)

    const swapped = holdPiece({ ...held, holdUsed: false }, fixedRng)
    expect(swapped.hold).toBe('I')
    expect(swapped.active!.type).toBe('T')
  })
})

describe('spillets slutning', () => {
  it('slutter, når der ikke er plads til den næste brik', () => {
    // Brættet er fyldt til over kanten: den næste brik kan ikke komme ind.
    const board = boardFromRows(
      Array.from({ length: BOARD_HEIGHT - 1 }, () => '##########'),
    )
    const state = gameWith({
      board,
      active: { type: 'O', rotation: 0, x: 3, y: 0 },
    })

    const over = hardDrop(state, fixedRng)

    expect(over.status).toBe('over')
    expect(over.active).toBeNull()
    // Et spil, der er slut, reagerer ikke på flere handlinger.
    expect(move(over, 1)).toEqual(over)
    expect(tick(over, 1000)).toEqual(over)
  })
})
