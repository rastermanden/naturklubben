import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

import { Game2048 } from './Game2048'

/** Værdien i et af tal-felterne over brættet. */
function stat(label: string) {
  return screen.getByText(label).parentElement!.textContent!.replace(label, '')
}

/** Brikkerne på brættet, læst af gitteret, i læseretning. */
function tiles(): number[] {
  return screen
    .getAllByRole('gridcell')
    .map((cell) => Number(cell.getAttribute('data-value')))
}

function swipe(dx: number, dy: number) {
  const board = screen.getByTestId('board-2048')
  fireEvent.pointerDown(board, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 100,
    clientY: 100,
  })
  fireEvent.pointerUp(board, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 100 + dx,
    clientY: 100 + dy,
  })
}

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  vi.restoreAllMocks()
})

describe('Game2048', () => {
  it('starter først spillet, når man beder om det', () => {
    render(<Game2048 />)

    expect(screen.getByText('Klar?')).toBeTruthy()
    expect(stat('Point')).toBe('0')
    expect(tiles().every((value) => value === 0)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    expect(screen.queryByText('Klar?')).toBeNull()
    expect(tiles().filter((value) => value !== 0)).toHaveLength(2)
  })

  it('flytter brikkerne med piletasterne', () => {
    // En fast terning: startbrikkerne og hver ny brik lander samme sted hver
    // gang, så trækket kan forudsiges.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    render(<Game2048 />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    const before = tiles()
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    const after = tiles()
    expect(after).not.toEqual(before)
    expect(stat('Træk')).toBe('1')
    // Alle brikker står nu i højre kolonne -- på nær den nye.
    const filled = after
      .map((value, index) => ({ value, col: index % 4 }))
      .filter(({ value }) => value !== 0)
    expect(filled.filter(({ col }) => col === 3).length).toBeGreaterThanOrEqual(
      2,
    )
  })

  it('flytter brikkerne med et stryg over brættet', () => {
    render(<Game2048 />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    swipe(0, 80)

    expect(stat('Træk')).toBe('1')
    // Efter et stryg nedad står de gamle brikker i nederste række.
    const bottomRow = tiles().slice(12)
    expect(bottomRow.filter((value) => value !== 0).length).toBeGreaterThan(0)
  })

  it('ignorerer et stryg, der er for kort til at være et', () => {
    render(<Game2048 />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))

    swipe(5, 8)

    expect(stat('Træk')).toBe('0')
  })

  it('sender ikke noget resultat, før spillet er slut', () => {
    render(<Game2048 />)
    fireEvent.click(screen.getByRole('button', { name: 'Start spillet' }))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(submit.mutate).not.toHaveBeenCalled()
  })
})
