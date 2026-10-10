import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewGameScore } from '../types'
import { CLASS_PAIRS, mulberry32, startGame } from './engine'

const submit = vi.hoisted(() => ({
  mutate: vi.fn<(result: NewGameScore) => void>(),
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null as unknown,
}))

vi.mock('../useGameScores', () => ({
  useSubmitScore: () => submit,
  usePersonalBest: () => ({ data: null }),
}))
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'alice' } } }),
}))

import { FugletraekGame } from './FugletraekGame'

function stat(label: string) {
  return screen.getByText(label).parentElement!.textContent!.replace(label, '')
}

/** Kort-knapperne på brættet, i rækkefølge. */
function cardButtons(): HTMLButtonElement[] {
  return screen
    .getAllByRole('button')
    .filter((button) =>
      /^(Skjult kort|Ræv|Rådyr|Ugle|Egern|Pindsvin|Frø|And|Svane|Bi|Sommerfugl|Snegl|Svamp)/.test(
        button.getAttribute('aria-label') ?? '',
      ),
    ) as HTMLButtonElement[]
}

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  submit.isError = false
  submit.error = null
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('FugletraekGame', () => {
  it('venter på, at man vælger et bræt', () => {
    render(<FugletraekGame />)

    expect(screen.getByText('Vælg et bræt')).toBeTruthy()
    expect(stat('Vendinger')).toBe('–')
    expect(screen.getByRole('button', { name: 'Let · 6 par' })).toBeTruthy()
  })

  it('åbner brættet og tæller en vending, når to kort vendes', () => {
    render(<FugletraekGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 6 par' }))

    expect(stat('Vendinger')).toBe('0')
    const cards = cardButtons()
    expect(cards).toHaveLength(CLASS_PAIRS[1] * 2)

    fireEvent.click(cards[0])
    expect(cards[0].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(cards[1])
    expect(stat('Vendinger')).toBe('1')
  })

  it('lægger et perfekt klaret bræt på listen', () => {
    vi.useFakeTimers()
    const seed = 42
    const probe = startGame(1, mulberry32(seed))
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))

    render(<FugletraekGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 6 par' }))

    const cards = cardButtons()
    // Par, art for art, i den rækkefølge terningen lagde brættet.
    const kinds = new Set(probe.cards.map((card) => card.kind))
    for (const kind of kinds) {
      const indices = probe.cards
        .map((card, index) => ({ card, index }))
        .filter((entry) => entry.card.kind === kind)
        .map((entry) => entry.index)
      fireEvent.click(cards[indices[0]])
      fireEvent.click(cards[indices[1]])
    }

    expect(screen.getByText('Brættet er klaret')).toBeTruthy()
    expect(submit.mutate).toHaveBeenCalledTimes(1)
    const result = submit.mutate.mock.calls[0][0]
    expect(result.lines).toBe(CLASS_PAIRS[1])
    expect(result.level).toBe(1)
    expect(result.score).toBe(1200)
  })

  it('vender to forskellige kort tilbage efter pausen', () => {
    vi.useFakeTimers()
    const seed = 3
    const probe = startGame(1, mulberry32(seed))
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))

    render(<FugletraekGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 6 par' }))

    const cards = cardButtons()
    // Find to kort af forskellig art.
    const firstKind = probe.cards[0].kind
    const other = probe.cards.findIndex((card) => card.kind !== firstKind)

    fireEvent.click(cards[0])
    fireEvent.click(cards[other])
    expect(cards[0].getAttribute('aria-pressed')).toBe('true')
    expect(stat('Vendinger')).toBe('1')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(cards[0].getAttribute('aria-pressed')).toBe('false')
    expect(cards[other].getAttribute('aria-pressed')).toBe('false')
  })

  it('viser Postgres-fejlen, når resultatet ikke kunne gemmes', () => {
    submit.isError = true
    submit.error = {
      code: '23514',
      message:
        'new row violates check constraint "game_scores_score_plausible"',
    }
    const seed = 42
    const probe = startGame(1, mulberry32(seed))
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))

    render(<FugletraekGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 6 par' }))

    const cards = cardButtons()
    const kinds = new Set(probe.cards.map((card) => card.kind))
    for (const kind of kinds) {
      const indices = probe.cards
        .map((card, index) => ({ card, index }))
        .filter((entry) => entry.card.kind === kind)
        .map((entry) => entry.index)
      fireEvent.click(cards[indices[0]])
      fireEvent.click(cards[indices[1]])
    }

    expect(
      screen.getByText('Resultatet blev ikke gemt. Prøv igen'),
    ).toBeTruthy()
    expect(screen.getByText(/23514:/)).toBeTruthy()
  })
})
