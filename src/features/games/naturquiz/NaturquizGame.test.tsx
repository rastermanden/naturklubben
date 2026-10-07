import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewGameScore } from '../types'
import { BASE_POINTS, MAX_SPEED_BONUS, createRound } from './engine'
import { speciesBank } from './bank'

const submit = vi.hoisted(() => ({
  mutate: vi.fn<(result: NewGameScore) => void>(),
  isPending: false,
  isError: false,
  isSuccess: false,
}))

vi.mock('../useGameScores', () => ({
  useSubmitScore: () => submit,
  usePersonalBest: () => ({ data: null }),
}))
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'alice' } } }),
}))

import { NaturquizGame } from './NaturquizGame'

/** Runden, som en fast terning (altid 0) giver -- akkurat den, komponenten
 *  også får, når `Math.random` er mokket til det samme. */
const round = createRound(() => 0, speciesBank, 10)

function start() {
  render(<NaturquizGame />)
  fireEvent.click(screen.getByRole('button', { name: 'Start quizzen' }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('NaturquizGame', () => {
  it('viser en startskærm, før runden begynder', () => {
    render(<NaturquizGame />)

    expect(screen.getByText('Klar til naturquiz?')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Svarmuligheder' })).toBeNull()
  })

  it('viser det første billede og fire svarmuligheder fra samme kategori', () => {
    start()

    const question = round[0]
    expect(screen.getByAltText(question.species.image.alt)).toBeTruthy()
    for (const option of question.options) {
      expect(screen.getByRole('button', { name: option.name })).toBeTruthy()
    }
  })

  it('giver point og en hastighedsbonus for et rigtigt svar med det samme', () => {
    start()

    const question = round[0]
    fireEvent.click(screen.getByRole('button', { name: question.species.name }))

    expect(
      screen.getByText(`Rigtigt! +${BASE_POINTS + MAX_SPEED_BONUS} point.`),
    ).toBeTruthy()
    // Svarmulighederne er slået fra, når spørgsmålet er besvaret.
    expect(
      screen
        .getByRole('button', { name: question.species.name })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('viser det rigtige svar, når man svarer forkert', () => {
    start()

    const question = round[0]
    const wrongOption = question.options.find(
      (option) => option.id !== question.correctId,
    )!
    fireEvent.click(screen.getByRole('button', { name: wrongOption.name }))

    expect(
      screen.getByText(
        `Forkert. Det rigtige svar var ${question.species.name}.`,
      ),
    ).toBeTruthy()
  })

  it('spiller alle ti spørgsmål igennem og gemmer resultatet', () => {
    start()

    for (let index = 0; index < round.length; index += 1) {
      const question = round[index]
      fireEvent.click(
        screen.getByRole('button', { name: question.species.name }),
      )
      const buttonName =
        index + 1 >= round.length ? 'Se resultatet' : 'Næste spørgsmål'
      fireEvent.click(screen.getByRole('button', { name: buttonName }))
    }

    expect(screen.getByText('Runden er slut')).toBeTruthy()
    expect(
      screen.getByText(`10 af 10 rigtige, længste streak ${round.length}.`, {
        exact: false,
      }),
    ).toBeTruthy()
    expect(submit.mutate).toHaveBeenCalledTimes(1)
    const [result] = submit.mutate.mock.calls[0]
    expect(result.lines).toBe(10)
    expect(result.score).toBeGreaterThan(0)
  })

  it('viser kilder til billederne', () => {
    start()

    fireEvent.click(screen.getByText('Kilder til billederne'))
    const sources = screen
      .getByText('Kilder til billederne')
      .closest('details')!
    for (const species of speciesBank.slice(0, 2)) {
      expect(within(sources).getByText(species.name)).toBeTruthy()
    }
  })
})
