import { describe, expect, it } from 'vitest'
import {
  CLASS_MAX_SCORE,
  CLASS_PAIRS,
  SPECIES,
  classTitle,
  className,
  createGame,
  isFaceUp,
  mulberry32,
  reduce,
  scoreFor,
  startGame,
  type Action,
  type FugletraekState,
  type GameClass,
} from './engine'

function play(state: FugletraekState, actions: Action[]): FugletraekState {
  return actions.reduce((current, action) => reduce(current, action), state)
}

/**
 * Går et bræt perfekt igennem: for hvert endnu ikke fundet par vendes de to
 * kort med samme art lige efter hinanden. Bruger terningen fra `startGame`, så
 * den samme rækkefølge kan testes.
 */
function solve(state: FugletraekState): FugletraekState {
  let current = state
  const kinds = new Set(current.cards.map((card) => card.kind))
  for (const kind of kinds) {
    const indices = current.cards
      .map((card, index) => ({ card, index }))
      .filter((entry) => entry.card.kind === kind)
      .map((entry) => entry.index)
    current = reduce(current, { type: 'flip', index: indices[0] })
    current = reduce(current, { type: 'flip', index: indices[1] })
  }
  return current
}

describe('startGame', () => {
  it.each([1, 2, 3] as const)(
    'lægger et bræt i klasse %s med to kort af hvert par',
    (level: GameClass) => {
      const state = startGame(level, mulberry32(level * 11))
      expect(state.cards).toHaveLength(CLASS_PAIRS[level] * 2)
      const byKind = new Map<string, number>()
      for (const card of state.cards) {
        byKind.set(card.kind, (byKind.get(card.kind) ?? 0) + 1)
        expect(card.matched).toBe(false)
      }
      expect(byKind.size).toBe(CLASS_PAIRS[level])
      for (const count of byKind.values()) expect(count).toBe(2)
    },
  )

  it('vælger forskellige arter fra listen', () => {
    const state = startGame(3, mulberry32(5))
    const kinds = new Set(state.cards.map((card) => card.kind))
    for (const kind of kinds) {
      expect(SPECIES.some((species) => species.id === kind)).toBe(true)
    }
  })

  it('gør ingenting, før en klasse er valgt', () => {
    const idle = createGame()
    expect(idle.status).toBe('idle')
    expect(reduce(idle, { type: 'flip', index: 0 })).toBe(idle)
  })
})

describe('vendingen', () => {
  function fixture(): FugletraekState {
    // To par, lagt i hånden: a a b b.
    return {
      status: 'running',
      level: 1,
      cards: [
        { id: 0, kind: 'a', symbol: '🦊', name: 'A', matched: false },
        { id: 1, kind: 'a', symbol: '🦊', name: 'A', matched: false },
        { id: 2, kind: 'b', symbol: '🦉', name: 'B', matched: false },
        { id: 3, kind: 'b', symbol: '🦉', name: 'B', matched: false },
      ],
      flipped: [],
      mismatch: false,
      flips: 0,
      matchedPairs: 0,
    }
  }

  it('vender første kort uden at tælle en vending', () => {
    const one = reduce(fixture(), { type: 'flip', index: 0 })
    expect(one.flipped).toEqual([0])
    expect(one.flips).toBe(0)
    expect(isFaceUp(one, 0)).toBe(true)
    expect(isFaceUp(one, 1)).toBe(false)
  })

  it('finder et par, tæller vendingen og markerer kortene', () => {
    const matched = play(fixture(), [
      { type: 'flip', index: 0 },
      { type: 'flip', index: 1 },
    ])
    expect(matched.flips).toBe(1)
    expect(matched.matchedPairs).toBe(1)
    expect(matched.cards[0].matched).toBe(true)
    expect(matched.cards[1].matched).toBe(true)
    expect(matched.flipped).toEqual([])
    expect(matched.status).toBe('running')
  })

  it('lader to forskellige ligge åbne og vender dem tilbage ved næste tryk', () => {
    const mism = play(fixture(), [
      { type: 'flip', index: 0 },
      { type: 'flip', index: 2 },
    ])
    expect(mism.mismatch).toBe(true)
    expect(mism.flips).toBe(1)
    expect(isFaceUp(mism, 0)).toBe(true)
    expect(isFaceUp(mism, 2)).toBe(true)

    const cleared = reduce(mism, { type: 'clearMismatch' })
    expect(cleared.mismatch).toBe(false)
    expect(isFaceUp(cleared, 0)).toBe(false)

    // Et tryk på et nyt kort under et mismatch rydder op og vender det nye.
    const next = reduce(mism, { type: 'flip', index: 1 })
    expect(next.mismatch).toBe(false)
    expect(next.flipped).toEqual([1])
    expect(isFaceUp(next, 0)).toBe(false)
  })

  it('ignorerer et allerede fundet eller samme kort', () => {
    const matched = play(fixture(), [
      { type: 'flip', index: 0 },
      { type: 'flip', index: 1 },
    ])
    expect(reduce(matched, { type: 'flip', index: 0 })).toBe(matched)

    const one = reduce(fixture(), { type: 'flip', index: 0 })
    expect(reduce(one, { type: 'flip', index: 0 })).toBe(one)
  })

  it('slutter partiet, når sidste par er fundet', () => {
    const done = play(fixture(), [
      { type: 'flip', index: 0 },
      { type: 'flip', index: 1 },
      { type: 'flip', index: 2 },
      { type: 'flip', index: 3 },
    ])
    expect(done.status).toBe('over')
    expect(done.matchedPairs).toBe(2)
    expect(reduce(done, { type: 'flip', index: 0 })).toBe(done)
  })
})

describe('point', () => {
  it('giver loftet for et perfekt og øjeblikkeligt parti', () => {
    expect(scoreFor(1, CLASS_PAIRS[1], 0)).toBe(CLASS_MAX_SCORE[1])
    expect(scoreFor(2, CLASS_PAIRS[2], 0)).toBe(CLASS_MAX_SCORE[2])
    expect(scoreFor(3, CLASS_PAIRS[3], 0)).toBe(CLASS_MAX_SCORE[3])
  })

  it('trækker fra for flere vendinger og mere tid, og aldrig over loftet', () => {
    const perfect = scoreFor(1, CLASS_PAIRS[1], 0)
    expect(scoreFor(1, CLASS_PAIRS[1] + 4, 30)).toBeLessThan(perfect)
    expect(scoreFor(1, CLASS_PAIRS[1], 60)).toBeLessThan(perfect)
    expect(scoreFor(1, CLASS_PAIRS[1], 0)).toBeLessThanOrEqual(CLASS_MAX_SCORE[1])
  })

  it('giver nul for en umulig vendings-tælling', () => {
    expect(scoreFor(1, CLASS_PAIRS[1] - 1, 0)).toBe(0)
  })

  it('kan spille et rigtigt bræt perfekt igennem til loftet', () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const start = startGame(2, mulberry32(seed * 13))
      const solved = solve(start)
      expect(solved.status).toBe('over')
      expect(solved.flips).toBe(CLASS_PAIRS[2])
      expect(scoreFor(solved.level, solved.flips, 0)).toBe(CLASS_MAX_SCORE[2])
    }
  })
})

describe('klassenavne', () => {
  it('navngiver de tre klasser', () => {
    expect(className(1)).toBe('let')
    expect(className(2)).toBe('mellemsvær')
    expect(className(3)).toBe('svær')
    expect(classTitle(1)).toBe('Let')
    expect(classTitle(3)).toBe('Svær')
  })
})
