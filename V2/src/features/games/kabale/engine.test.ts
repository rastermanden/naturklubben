import { describe, expect, it } from 'vitest'
import {
  DECK_SIZE,
  DRAW3_BONUS,
  POINTS,
  SCORE_CAP,
  SUITS,
  TIME_BONUS_START,
  allFaceUp,
  applyMove,
  autoFinish,
  canLift,
  cardLabel,
  deal,
  freshDeck,
  isLegal,
  isWon,
  reduce,
  scoreFor,
  stockAction,
  type Card,
  type GameState,
  type Move,
  type Rank,
  type Suit,
} from './engine'

function card(suit: Suit, rank: Rank, faceUp = true): Card {
  return {
    id: SUITS.indexOf(suit) * 13 + (rank - 1),
    suit,
    rank,
    faceUp,
  }
}

function ranks(from: number, to: number): Rank[] {
  const list: Rank[] = []
  for (let rank = from; rank <= to; rank++) list.push(rank as Rank)
  return list
}

function blank(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'playing',
    drawCount: 1,
    tableau: Array.from({ length: 7 }, () => []),
    foundations: [[], [], [], []],
    stock: [],
    waste: [],
    moves: 0,
    points: 0,
    history: [],
    ...overrides,
  }
}

function move(partial: Move): Move {
  return partial
}

describe('givningen', () => {
  it('lægger syv rækker, 24 kort i bunken og intet på talonen', () => {
    const state = deal(1, () => 0.3)

    expect(state.tableau.map((column) => column.length)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
    for (const column of state.tableau) {
      expect(column.slice(0, -1).every((entry) => !entry.faceUp)).toBe(true)
      expect(column[column.length - 1].faceUp).toBe(true)
    }
    expect(state.stock).toHaveLength(24)
    expect(state.stock.every((entry) => !entry.faceUp)).toBe(true)
    expect(state.waste).toHaveLength(0)
    expect(state.foundations.every((pile) => pile.length === 0)).toBe(true)

    const ids = [...state.stock, ...state.tableau.flat()].map(
      (entry) => entry.id,
    )
    expect(new Set(ids).size).toBe(DECK_SIZE)
    expect(freshDeck()).toHaveLength(DECK_SIZE)
  })

  it('giver den samme givning for den samme terning', () => {
    const first = deal(1, sequence(0.1, 0.9, 0.2))
    const second = deal(1, sequence(0.1, 0.9, 0.2))
    expect(
      first.tableau.map((column) => column.map((entry) => entry.id)),
    ).toEqual(second.tableau.map((column) => column.map((entry) => entry.id)))
  })
})

describe('bunken', () => {
  it('trækker ét kort, med forsiden opad, og lægger det øverst på talonen', () => {
    const state = blank({
      drawCount: 1,
      stock: [card('hjerter', 1, false), card('spar', 13, false)],
    })

    const next = reduce(state, { type: 'draw' })

    expect(next.stock.map(cardLabel)).toEqual(['hjerter es'])
    expect(next.waste.map(cardLabel)).toEqual(['spar konge'])
    expect(next.waste[0].faceUp).toBe(true)
    expect(next.moves).toBe(1)
    expect(next.points).toBe(0)
  })

  it('trækker tre kort, så det sidst trukne ligger øverst', () => {
    // Bunden først. Toppen af bunken er klør 4 og trækkes først.
    const state = blank({
      drawCount: 3,
      stock: [
        card('hjerter', 1, false),
        card('spar', 2, false),
        card('ruder', 3, false),
        card('klør', 4, false),
      ],
    })

    const next = reduce(state, { type: 'draw' })

    expect(next.stock.map(cardLabel)).toEqual(['hjerter es'])
    expect(next.waste.map(cardLabel)).toEqual(['klør 4', 'ruder 3', 'spar 2'])
    expect(stockAction(next)).toBe('draw')
  })

  it('tager de sidste kort, selv om der er færre end tre', () => {
    const state = blank({
      drawCount: 3,
      stock: [card('hjerter', 5, false), card('spar', 6, false)],
    })

    const next = reduce(state, { type: 'draw' })

    expect(next.stock).toHaveLength(0)
    expect(next.waste).toHaveLength(2)
    expect(cardLabel(next.waste[1])).toBe('hjerter 5')
  })

  it('vender talonen tilbage til bunken, med fradrag, når bunken er tom', () => {
    const drawn = reduce(
      blank({
        stock: [card('hjerter', 1, false), card('spar', 2, false)],
      }),
      { type: 'draw' },
    )
    const emptyStock = reduce(drawn, { type: 'draw' })
    expect(stockAction(emptyStock)).toBe('recycle')

    const recycled = reduce(emptyStock, { type: 'draw' })

    expect(recycled.waste).toHaveLength(0)
    expect(recycled.stock.map(cardLabel)).toEqual(['hjerter es', 'spar 2'])
    expect(recycled.stock.every((entry) => !entry.faceUp)).toBe(true)
    expect(recycled.points).toBe(POINTS.recycleDraw1)
  })

  it('giver et mindre fradrag, når man trækker tre', () => {
    const state = blank({
      drawCount: 3,
      waste: [card('hjerter', 1), card('spar', 2)],
    })

    const recycled = reduce(state, { type: 'draw' })

    expect(recycled.points).toBe(POINTS.recycleDraw3)
    expect(cardLabel(recycled.stock[1])).toBe('hjerter es')
  })

  it('gør ingenting, når både bunke og talon er tomme', () => {
    const state = blank()
    expect(stockAction(state)).toBeNull()
    expect(reduce(state, { type: 'draw' })).toBe(state)
  })
})

describe('rækker og grundbunker', () => {
  it('lægger kun en konge på en tom række', () => {
    const state = blank({
      waste: [card('hjerter', 12), card('spar', 13)],
    })

    const king = reduce(state, {
      type: 'move',
      move: move({
        from: { kind: 'waste' },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    })
    expect(cardLabel(king.tableau[0][0])).toBe('spar konge')
    expect(king.points).toBe(POINTS.wasteToTableau)

    const queenOnEmpty = blank({ waste: [card('hjerter', 12)] })
    const refused = reduce(queenOnEmpty, {
      type: 'move',
      move: move({
        from: { kind: 'waste' },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    })
    expect(refused).toBe(queenOnEmpty)
  })

  it('bygger nedad i skiftende farve og afviser samme farve', () => {
    const state = blank({
      tableau: [[card('spar', 13)], [], [], [], [], [], []],
      waste: [card('hjerter', 12)],
    })
    const placed = reduce(state, {
      type: 'move',
      move: move({
        from: { kind: 'waste' },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    })
    expect(placed.tableau[0].map(cardLabel)).toEqual([
      'spar konge',
      'hjerter dame',
    ])

    const sameColor = blank({
      tableau: [[card('ruder', 8)], [], [], [], [], [], []],
      waste: [card('hjerter', 7)],
    })
    expect(
      isLegal(sameColor, {
        from: { kind: 'waste' },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    ).toBe(false)
  })

  it('flytter en åben serie og vender det kort, der bliver frit', () => {
    const state = blank({
      tableau: [
        [card('ruder', 9), card('spar', 8), card('hjerter', 7)],
        [card('klør', 7, false), card('spar', 6)],
        [],
        [],
        [],
        [],
        [],
      ],
    })

    expect(canLift(state, { kind: 'tableau', index: 0 }, 0)).toBe(true)
    expect(canLift(state, { kind: 'tableau', index: 1 }, 0)).toBe(false)

    const next = reduce(state, {
      type: 'move',
      move: move({
        from: { kind: 'tableau', index: 1 },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    })

    expect(next.tableau[0].map(cardLabel)).toEqual([
      'ruder 9',
      'spar 8',
      'hjerter 7',
      'spar 6',
    ])
    expect(next.tableau[1][0].faceUp).toBe(true)
    expect(cardLabel(next.tableau[1][0])).toBe('klør 7')
    expect(next.points).toBe(POINTS.flip)
  })

  it('nægter at flytte en serie, der ikke hænger sammen', () => {
    const state = blank({
      tableau: [
        [card('hjerter', 10), card('spar', 13), card('ruder', 12)],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    })

    expect(canLift(state, { kind: 'tableau', index: 0 }, 1)).toBe(true)
    expect(canLift(state, { kind: 'tableau', index: 0 }, 0)).toBe(false)
    expect(
      isLegal(state, {
        from: { kind: 'tableau', index: 0 },
        to: { kind: 'tableau', index: 1 },
        count: 3,
      }),
    ).toBe(false)
    const moved = reduce(state, {
      type: 'move',
      move: move({
        from: { kind: 'tableau', index: 0 },
        to: { kind: 'tableau', index: 1 },
        count: 2,
      }),
    })
    expect(moved.tableau[1].map(cardLabel)).toEqual([
      'spar konge',
      'ruder dame',
    ])
    expect(moved.tableau[0].map(cardLabel)).toEqual(['hjerter 10'])
  })

  it('bygger grundbunken fra es i samme kulør', () => {
    const ace = reduce(blank({ waste: [card('hjerter', 1)] }), {
      type: 'toFoundation',
      from: { kind: 'waste' },
    })
    expect(ace.foundations[0].map(cardLabel)).toEqual(['hjerter es'])
    expect(ace.points).toBe(POINTS.toFoundation)

    const two = reduce(
      blank({
        waste: [card('hjerter', 2)],
        foundations: [[card('hjerter', 1)], [], [], []],
      }),
      { type: 'toFoundation', from: { kind: 'waste' } },
    )
    expect(two.foundations[0].map(cardLabel)).toEqual([
      'hjerter es',
      'hjerter 2',
    ])

    const wrongSuit = blank({
      waste: [card('ruder', 2)],
      foundations: [[card('hjerter', 1)], [], [], []],
    })
    expect(
      reduce(wrongSuit, { type: 'toFoundation', from: { kind: 'waste' } }),
    ).toBe(wrongSuit)

    const notAnAce = blank({ waste: [card('spar', 5)] })
    expect(
      reduce(notAnAce, { type: 'toFoundation', from: { kind: 'waste' } }),
    ).toBe(notAnAce)
  })

  it('tager point tilbage, når et kort flyttes fra grundbunken til en række', () => {
    const state = blank({
      foundations: [[card('hjerter', 1)], [], [], []],
      tableau: [[card('spar', 2)], [], [], [], [], [], []],
    })
    const next = reduce(state, {
      type: 'move',
      move: move({
        from: { kind: 'foundation', index: 0 },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    })
    expect(next.foundations[0]).toHaveLength(0)
    expect(next.tableau[0].map(cardLabel)).toEqual(['spar 2', 'hjerter es'])
    expect(next.points).toBe(POINTS.foundationToTableau)
  })
})

describe('fortryd', () => {
  it('lægger trækket tilbage, også et kort der blev vendt', () => {
    const state = blank({
      tableau: [
        [card('spar', 11)],
        [card('klør', 7, false), card('ruder', 10)],
        [],
        [],
        [],
        [],
        [],
      ],
    })
    const moved = reduce(state, {
      type: 'move',
      move: move({
        from: { kind: 'tableau', index: 1 },
        to: { kind: 'tableau', index: 0 },
        count: 1,
      }),
    })
    expect(moved.tableau[1][0].faceUp).toBe(true)

    const undone = reduce(moved, { type: 'undo' })

    expect(undone.tableau[0].map(cardLabel)).toEqual(['spar knægt'])
    expect(undone.tableau[1][0].faceUp).toBe(false)
    expect(undone.moves).toBe(0)
    expect(undone.points).toBe(0)
    expect(reduce(undone, { type: 'undo' })).toBe(undone)
  })
})

describe('vundet parti og point', () => {
  it('lægger kongerne hjem, når alle kort er vendt', () => {
    let state = solved()
    for (let index = 0; index < 4; index++) {
      state = applyMove(state, {
        from: { kind: 'foundation', index },
        to: { kind: 'tableau', index },
        count: 1,
      })
    }
    expect(isWon(state)).toBe(false)
    expect(allFaceUp(state)).toBe(true)

    const finished = autoFinish(state)

    expect(finished.status).toBe('won')
    expect(finished.foundations.every((pile) => pile.length === 13)).toBe(true)
  })

  it('lægger en begravet es hjem via en tom række', () => {
    const finished = autoFinish(buriedAce())

    expect(finished.status).toBe('won')
    expect(isWon(finished)).toBe(true)
    expect(finished.moves).toBeGreaterThan(0)
  })

  it('rører ikke et parti, hvor der stadig ligger kort med bagsiden opad', () => {
    const state = deal(1, () => 0.4)
    expect(allFaceUp(state)).toBe(false)
    expect(autoFinish(state)).toBe(state)
    expect(reduce(state, { type: 'draw' }).status).toBe('playing')
  })

  it('afslutter partiet, når det sidste kort går hjem', () => {
    let state = solved()
    state = applyMove(state, {
      from: { kind: 'foundation', index: 0 },
      to: { kind: 'tableau', index: 0 },
      count: 1,
    })

    const won = reduce(state, {
      type: 'move',
      move: {
        from: { kind: 'tableau', index: 0 },
        to: { kind: 'foundation', index: 0 },
        count: 1,
      },
    })

    expect(won.status).toBe('won')
    expect(reduce(won, { type: 'draw' })).toBe(won)
    expect(reduce(won, { type: 'undo' })).toBe(won)
  })

  it('holder listens point inden for loftet', () => {
    expect(scoreFor(100, 1, 0)).toBe(100 + TIME_BONUS_START)
    expect(scoreFor(100, 3, 0)).toBe(100 + TIME_BONUS_START + DRAW3_BONUS)
    expect(scoreFor(100, 1, TIME_BONUS_START)).toBe(100)
    expect(scoreFor(-400, 1, 10_000)).toBe(1)
    expect(scoreFor(5_000, 3, 0)).toBe(SCORE_CAP)
  })
})

/** Alle kort ligger hjemme, men partiet er ikke markeret vundet endnu. */
function solved(): GameState {
  return blank({
    foundations: SUITS.map((suit) =>
      ranks(1, 13).map((rank) => card(suit, rank)),
    ),
  })
}

/**
 * Hjerter es ligger under ruder konge, og ruder knægt ligger under damen.
 * Kongen kan ikke hjem, før damen og knægten er fri, og es kan ikke hjem, før
 * kongen er flyttet til en tom række. Resten af hjerter ligger i rækkefølge
 * med toeren øverst, så de kan skrælles af, når es er lagt.
 */
function buriedAce(): GameState {
  const foundations = SUITS.map((suit) =>
    ranks(1, 13).map((rank) => card(suit, rank)),
  )
  foundations[0] = []
  foundations[1] = foundations[1].slice(0, 10)
  const hearts = ranks(2, 13)
    .reverse()
    .map((rank) => card('hjerter', rank))
  return blank({
    foundations,
    tableau: [
      [
        card('ruder', 11),
        card('ruder', 12),
        card('hjerter', 1),
        card('ruder', 13),
      ],
      [],
      [],
      hearts,
      [],
      [],
      [],
    ],
  })
}

function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}
