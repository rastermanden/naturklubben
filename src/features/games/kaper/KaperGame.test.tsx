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
  useAuth: () => ({
    session: {
      user: { id: 'alice', user_metadata: { full_name: 'Alice Andersen' } },
    },
  }),
}))

import { KaperGame } from './KaperGame'

/** Værdien i et af tal-felterne over kortet. */
function stat(label: string) {
  return screen.getByText(label).parentElement!.textContent!.replace(label, '')
}

function setSail() {
  render(<KaperGame />)
  fireEvent.click(screen.getByRole('button', { name: 'Stik til søs' }))
}

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  vi.restoreAllMocks()
})

describe('KaperGame', () => {
  it('spørger om navnet og foreslår medlemmets fornavn', () => {
    render(<KaperGame />)

    const name = screen.getByLabelText('Hvad hedder du, kaptajn?')
    expect((name as HTMLInputElement).value).toBe('Alice')
    expect(
      screen
        .getByRole('button', { name: 'Sejl mod nord' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('stævner ud med kortet og styringen slået til', () => {
    setSail()

    expect(screen.getByRole('img', { name: /Kort over Kattegat/ })).toBeTruthy()
    expect(stat('Træk')).toBe('0')
    expect(
      screen
        .getByRole('button', { name: 'Sejl mod nord' })
        .hasAttribute('disabled'),
    ).toBe(false)
  })

  it('tæller trækkene, både fra knapperne og fra tastaturet', () => {
    // Ingen møder undervejs.
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    setSail()

    fireEvent.click(screen.getByRole('button', { name: 'Sejl mod øst' }))
    expect(stat('Træk')).toBe('1')

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(stat('Træk')).toBe('2')
  })

  it('lader udkiggen råbe, og fører kampen hen over kanondækket', () => {
    // Terningen viser 0 hele vejen: et møde på første træk, og det er et
    // handelsskib. Kuglen går for langt, fordi hun ligger tæt på.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    setSail()

    fireEvent.click(screen.getByRole('button', { name: 'Sejl mod øst' }))
    expect(screen.getByText('Udkiggen råber: Skib ohøj!')).toBeTruthy()
    expect(screen.getByText(/Engelsk handelsskib i sigte/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Angrib' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kanoner' }))
    expect(
      screen.getByRole('img', { name: /handelsskib på 500 fods afstand/ }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sigt højere' }))
    expect(screen.getByText(/Sigte: -5 i højden/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fyr!' }))
    expect(screen.getByText(/For langt/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Videre' }))
    expect(screen.getByRole('button', { name: 'Fyr!' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Træk dig tilbage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flygt' }))
    expect(screen.getByRole('img', { name: /Kort over Kattegat/ })).toBeTruthy()
  })

  it('slutter spillet uden at gemme et resultat på nul point', () => {
    // Ingen møder, og ingen havne: kornet slipper op efter 60 træk, og så
    // sulter besætningen, til der er for få til at sejle skibet.
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    setSail()

    for (let index = 0; index < 120; index += 1) {
      fireEvent.keyDown(window, {
        key: index % 2 === 0 ? 'ArrowRight' : 'ArrowLeft',
      })
    }

    expect(screen.getByText('Besætningen sultede ihjel.')).toBeTruthy()
    expect(screen.getByText(/Spillet er slut med 0 point/)).toBeTruthy()
    expect(submit.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Spil igen' })).toBeTruthy()
  })
})
