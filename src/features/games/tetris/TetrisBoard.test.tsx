import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  VISIBLE_HEIGHT,
  createBoard,
  createGame,
  type Cell,
} from './engine'
import { PIECE_COLORS } from './colors'
import { TetrisBoard } from './TetrisBoard'

/**
 * Et notesblok-canvas: det tegner ingenting, men skriver ned, hvad det blev
 * bedt om. jsdom har ikke et rigtigt tegneprogram, og pointen her er heller
 * ikke billedet -- det er, at brættet beder om de rigtige klodser i de
 * rigtige farver.
 */
function recordingContext() {
  const fills: { color: string; alpha: number }[] = []
  const context = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(() => {
      fills.push({
        color: String(context.fillStyle),
        alpha: context.globalAlpha,
      })
    }),
  }
  return { context, fills }
}

function renderBoard(state: Parameters<typeof TetrisBoard>[0]['state']) {
  const { context, fills } = recordingContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  render(<TetrisBoard state={state} />)
  return { context, fills }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TetrisBoard', () => {
  it('tegner gitteret én gang pr. skillelinje', () => {
    const { context } = renderBoard(createGame())

    expect(context.stroke).toHaveBeenCalledTimes(
      BOARD_WIDTH - 1 + (VISIBLE_HEIGHT - 1),
    )
  })

  it('tegner de låste klodser i brikkens egen farve', () => {
    const board: Cell[][] = createBoard().map((row) => [...row])
    board[BOARD_HEIGHT - 1][0] = 'T'
    board[BOARD_HEIGHT - 1][1] = 'S'

    const { fills } = renderBoard({ ...createGame(), board })

    expect(fills).toEqual([
      { color: PIECE_COLORS.T, alpha: 1 },
      { color: PIECE_COLORS.S, alpha: 1 },
    ])
  })

  it('tegner skyggen under den aktive brik i en svagere udgave', () => {
    const { fills } = renderBoard({
      ...createGame(),
      status: 'running',
      active: { type: 'O', rotation: 0, x: 3, y: 5 },
    })

    const ghost = fills.filter((paint) => paint.alpha < 1)
    const piece = fills.filter((paint) => paint.alpha === 1)

    expect(ghost).toHaveLength(4)
    expect(piece).toHaveLength(4)
    expect(new Set(fills.map((paint) => paint.color))).toEqual(
      new Set([PIECE_COLORS.O]),
    )
  })

  it('tegner ikke rækkerne over brættets kant', () => {
    // Brikken kommer ind i de skjulte rækker: dér er der intet at vise endnu,
    // kun skyggen nede på bunden.
    const { fills } = renderBoard({
      ...createGame(),
      status: 'running',
      active: { type: 'I', rotation: 0, x: 3, y: 0 },
    })

    expect(fills.every((paint) => paint.alpha < 1)).toBe(true)
  })
})
