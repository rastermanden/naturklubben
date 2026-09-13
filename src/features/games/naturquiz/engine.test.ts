import { describe, expect, it } from 'vitest'
import {
  BASE_POINTS,
  MAX_SPEED_BONUS,
  OPTIONS_PER_QUESTION,
  QUESTIONS_PER_ROUND,
  QUESTION_TIME_LIMIT_MS,
  STREAK_BONUS_PER_LEVEL,
  answerQuestion,
  createGame,
  createRound,
  currentQuestion,
  nextQuestion,
  startGame,
  speciesBank,
  type NaturquizState,
  type Species,
} from './engine'

/** En simpel, gennemprøvet PRNG (mulberry32), så en runde kan gengives i en test. */
function seededRng(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function speciesOf(id: string): Species {
  const species = speciesBank.find((s) => s.id === id)
  if (!species) throw new Error(`Ukendt art i test: ${id}`)
  return species
}

describe('createRound', () => {
  it('giver ti spørgsmål med hver fire muligheder fra samme kategori', () => {
    const round = createRound(seededRng(1))

    expect(round).toHaveLength(QUESTIONS_PER_ROUND)
    for (const question of round) {
      expect(question.options).toHaveLength(OPTIONS_PER_QUESTION)
      expect(question.options.map((o) => o.id)).toContain(question.correctId)
      for (const option of question.options) {
        expect(option.category).toBe(question.species.category)
      }
      // Ingen gengangere blandt de fire muligheder.
      const ids = new Set(question.options.map((o) => o.id))
      expect(ids.size).toBe(OPTIONS_PER_QUESTION)
    }
  })

  it('spørger ikke om samme art to gange i samme runde', () => {
    const round = createRound(seededRng(42))
    const ids = new Set(round.map((q) => q.species.id))
    expect(ids.size).toBe(round.length)
  })

  it('udelader en art, der er alene i sin kategori i banken', () => {
    const lonelyBird = speciesOf('blaamejse')
    const plants = speciesBank.filter((s) => s.category === 'plante')
    const tinyBank = [lonelyBird, ...plants]

    const round = createRound(seededRng(7), tinyBank, 5)

    expect(round.every((q) => q.species.id !== 'blaamejse')).toBe(true)
  })
})

describe('startGame', () => {
  it('starter en løbende runde med nulstillet point og streak', () => {
    const state = startGame(seededRng(3))

    expect(state.status).toBe('running')
    expect(state.questions).toHaveLength(QUESTIONS_PER_ROUND)
    expect(state.index).toBe(0)
    expect(state.score).toBe(0)
    expect(state.streak).toBe(0)
    expect(state.maxStreak).toBe(0)
    expect(state.correctCount).toBe(0)
    expect(state.lastResult).toBeNull()
  })
})

describe('answerQuestion', () => {
  function stateAt(index: number, overrides: Partial<NaturquizState> = {}) {
    const started = startGame(seededRng(9))
    return { ...started, index, ...overrides }
  }

  it('giver grundpoint og fuld hastighedsbonus for et prompte rigtigt svar', () => {
    const state = stateAt(0)
    const question = currentQuestion(state)!

    const answered = answerQuestion(state, question.correctId, 0)

    expect(answered.lastResult).toEqual({
      choiceId: question.correctId,
      correct: true,
      elapsedMs: 0,
      points: BASE_POINTS + MAX_SPEED_BONUS,
    })
    expect(answered.score).toBe(BASE_POINTS + MAX_SPEED_BONUS)
    expect(answered.correctCount).toBe(1)
    expect(answered.streak).toBe(1)
    expect(answered.maxStreak).toBe(1)
  })

  it('giver ingen hastighedsbonus, når tiden er brugt op', () => {
    const state = stateAt(0)
    const question = currentQuestion(state)!

    const answered = answerQuestion(
      state,
      question.correctId,
      QUESTION_TIME_LIMIT_MS,
    )

    expect(answered.lastResult?.points).toBe(BASE_POINTS)
  })

  it('lægger en streakbonus til, når flere svar i træk er rigtige', () => {
    const state = stateAt(0, { streak: 3 })
    const question = currentQuestion(state)!

    const answered = answerQuestion(state, question.correctId, 0)

    expect(answered.lastResult?.points).toBe(
      BASE_POINTS + MAX_SPEED_BONUS + STREAK_BONUS_PER_LEVEL * 3,
    )
    expect(answered.streak).toBe(4)
    expect(answered.maxStreak).toBe(4)
  })

  it('giver ingen point for et forkert svar og nulstiller stregen', () => {
    const state = stateAt(0, { streak: 5, maxStreak: 5 })
    const question = currentQuestion(state)!
    const wrongOption = question.options.find(
      (o) => o.id !== question.correctId,
    )!

    const answered = answerQuestion(state, wrongOption.id, 500)

    expect(answered.lastResult).toEqual({
      choiceId: wrongOption.id,
      correct: false,
      elapsedMs: 500,
      points: 0,
    })
    expect(answered.score).toBe(0)
    expect(answered.streak).toBe(0)
    // Rekorden for runden husker stadig den forrige, længere streak.
    expect(answered.maxStreak).toBe(5)
  })

  it('tæller intet svar (tiden løb ud) som forkert', () => {
    const state = stateAt(0, { streak: 2 })

    const answered = answerQuestion(state, null, QUESTION_TIME_LIMIT_MS)

    expect(answered.lastResult).toEqual({
      choiceId: null,
      correct: false,
      elapsedMs: QUESTION_TIME_LIMIT_MS,
      points: 0,
    })
    expect(answered.streak).toBe(0)
  })

  it('ændrer ikke tilstanden, hvis spørgsmålet allerede har fået et svar', () => {
    const state = stateAt(0)
    const question = currentQuestion(state)!
    const answered = answerQuestion(state, question.correctId, 0)

    const secondAttempt = answerQuestion(answered, question.correctId, 0)

    expect(secondAttempt).toBe(answered)
  })

  it('ændrer ikke en tilstand, der ikke kører', () => {
    const idle = createGame()
    expect(answerQuestion(idle, 'noget', 0)).toBe(idle)
  })
})

describe('nextQuestion', () => {
  it('går videre til næste spørgsmål og rydder sidste resultat', () => {
    const state = startGame(seededRng(11))
    const question = currentQuestion(state)!
    const answered = answerQuestion(state, question.correctId, 0)

    const next = nextQuestion(answered)

    expect(next.index).toBe(1)
    expect(next.lastResult).toBeNull()
    expect(next.status).toBe('running')
  })

  it('gør ingenting, før spørgsmålet er besvaret', () => {
    const state = startGame(seededRng(11))
    expect(nextQuestion(state)).toBe(state)
  })

  it('afslutter runden efter det tiende spørgsmål', () => {
    let state = startGame(seededRng(13))

    for (let i = 0; i < QUESTIONS_PER_ROUND; i += 1) {
      const question = currentQuestion(state)!
      state = answerQuestion(state, question.correctId, 0)
      state = nextQuestion(state)
    }

    expect(state.status).toBe('over')
    expect(state.correctCount).toBe(QUESTIONS_PER_ROUND)
    expect(state.score).toBeGreaterThan(0)
  })
})
