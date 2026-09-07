import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { NewGameScore } from '../types'

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

import { TetrisGame } from './TetrisGame'

/** Værdien i et af de fire tal-felter over brættet. */
function stat(label: string) {
  return screen.getByText(label).parentElement!.textContent!.replace(label, '')
}

// jsdom kan ikke tegne på et canvas. Brættet klarer selv et manglende
// tegneprogram -- her siges det bare højt, så testen ikke drukner i advarsler.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
})

describe('TetrisGame', () => {
  it('starter først spillet, når man beder om det', () => {
    render(<TetrisGame />)

    expect(screen.getByText('Klar?')).toBeTruthy()
    expect(stat('Point')).toBe('0')
    // Knapperne under brættet er slået fra, indtil der er et spil at styre.
    expect(
      screen
        .getByRole('button', { name: 'Flyt til venstre' })
        .hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    expect(screen.queryByText('Klar?')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Flyt til venstre' })
        .hasAttribute('disabled'),
    ).toBe(false)
  })

  it('giver point for et hårdt fald med mellemrumstasten', () => {
    render(<TetrisGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    fireEvent.keyDown(window, { key: ' ' })

    // Brikken falder brættet igennem og giver to point pr. række.
    expect(Number(stat('Point'))).toBeGreaterThan(0)
  })

  it('kan sættes på pause og fortsætte igen', () => {
    render(<TetrisGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    fireEvent.keyDown(window, { key: 'p' })
    expect(screen.getByText('Pause')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt' }))

    expect(screen.queryByRole('button', { name: 'Fortsæt' })).toBeNull()
    // Knappen under brættet tilbyder nu pausen igen -- spillet kører.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  })

  it('gemmer brikken, når man trykker C', () => {
    render(<TetrisGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    expect(screen.getByRole('img', { name: 'Gemt: tom' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'c' })

    expect(screen.queryByRole('img', { name: 'Gemt: tom' })).toBeNull()
  })
})
