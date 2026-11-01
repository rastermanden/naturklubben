import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewGameScore } from '../types'

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
  usePlayerId: () => 'alice',
}))

import { KabaleGame } from './KabaleGame'

function stat(label: string) {
  return screen.getByText(label).parentElement!.textContent!.replace(label, '')
}

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  submit.isError = false
  submit.error = null
})

describe('KabaleGame', () => {
  it('giver et parti med det samme og har syv åbne rækker', () => {
    render(<KabaleGame />)

    expect(screen.getByText('Sådan spiller du')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /række/ })).toHaveLength(7)
    expect(
      screen.getAllByRole('button', { name: /Tom grundbunke/ }),
    ).toHaveLength(4)
    expect(stat('Træk')).toBe('0')
    expect(
      (screen.getByRole('button', { name: 'Fortryd' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: '1 kort' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('trækker et kort fra bunken og kan fortryde det', () => {
    render(<KabaleGame />)

    fireEvent.click(screen.getByRole('button', { name: /Bunken/ }))

    expect(screen.getByRole('button', { name: /talon/ })).toBeTruthy()
    expect(stat('Træk')).toBe('1')
    expect(
      (screen.getByRole('button', { name: 'Fortryd' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /talon/ }))
    expect(
      screen
        .getByRole('button', { name: /talon/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Fortryd' }))

    expect(screen.queryByRole('button', { name: /talon/ })).toBeNull()
    expect(stat('Træk')).toBe('0')
  })

  it('starter forfra, når man skifter til tre kort', () => {
    render(<KabaleGame />)
    fireEvent.click(screen.getByRole('button', { name: /Bunken/ }))
    expect(stat('Træk')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: '3 kort' }))

    expect(stat('Træk')).toBe('0')
    expect(screen.getByRole('button', { name: /op til tre kort/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /talon/ })).toBeNull()
  })
})
