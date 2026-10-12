import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewGameScore } from '../types'
import {
  cheapestRoute,
  mapLabel,
  mulberry32,
  startGame,
  type Pos,
} from './engine'

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

import { StiGame } from './StiGame'

function stat(label: string) {
  return screen.getByText(label).parentElement!.textContent!.replace(label, '')
}

function keyFor(from: Pos, to: Pos): string {
  if (to.x === from.x + 1) return 'ArrowRight'
  if (to.x === from.x - 1) return 'ArrowLeft'
  if (to.y === from.y + 1) return 'ArrowDown'
  if (to.y === from.y - 1) return 'ArrowUp'
  throw new Error(
    `Skridtet ${from.x},${from.y} → ${to.x},${to.y} er ikke ét felt`,
  )
}

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  vi.restoreAllMocks()
})

describe('StiGame', () => {
  it('venter på, at man vælger en bane', () => {
    render(<StiGame />)

    expect(screen.getByText('Vælg en bane')).toBeTruthy()
    expect(stat('Terræn')).toBe('–')
    expect(
      screen
        .getByRole('button', { name: 'Gå mod nord' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Giv op' })).toBeNull()
  })

  it('åbner kortet og tæller terræntid, både fra knapperne og tastaturet', () => {
    render(<StiGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 5 poster' }))

    expect(
      screen.getByRole('img', { name: /Kort over en let bane/ }),
    ).toBeTruthy()
    expect(stat('Terræn')).toBe('0')
    expect(stat('Post')).toBe('0 / 5')
    expect(
      screen
        .getByRole('button', { name: 'Gå mod nord' })
        .hasAttribute('disabled'),
    ).toBe(false)

    for (const name of [
      'Gå mod nord',
      'Gå mod øst',
      'Gå mod syd',
      'Gå mod vest',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    const afterButtons = stat('Terræn')
    expect(afterButtons).not.toBe('0')

    fireEvent.keyDown(window, { key: 'w' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(stat('Skridt')).not.toBe('0')
  })

  it('gemmer ikke en bane, man giver op på', () => {
    render(<StiGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 5 poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Giv op' }))

    expect(screen.getByText('Du gav op')).toBeTruthy()
    expect(screen.getByText('Du gav op.')).toBeTruthy()
    expect(submit.mutate).not.toHaveBeenCalled()
  })

  it('lægger den hurtigste lette bane på listen', () => {
    const seed = 7
    const probe = startGame(1, mulberry32(seed))
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))

    render(<StiGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Let · 5 poster' }))
    expect(screen.getByRole('img', { name: mapLabel(probe) })).toBeTruthy()

    let cursor = { x: probe.x, y: probe.y }
    for (const control of probe.controls) {
      const route = cheapestRoute(probe.terrain, cursor, control)
      for (const step of route) {
        fireEvent.keyDown(window, { key: keyFor(cursor, step) })
        cursor = step
      }
    }

    expect(screen.getByText('Hurtigste rute.')).toBeTruthy()
    expect(submit.mutate).toHaveBeenCalledWith({
      score: 1200,
      lines: 5,
      level: 1,
      durationSeconds: probe.optimal,
    })
  })
})
