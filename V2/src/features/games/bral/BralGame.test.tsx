import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewGameScore } from '../types'
import type { BralState } from './engine'

const submit = vi.hoisted(() => ({
  mutate: vi.fn<(result: NewGameScore) => void>(),
  isPending: false,
  isError: false,
  isSuccess: false,
}))

const opening = vi.hoisted(() => ({
  override: null as Partial<BralState> | null,
}))

vi.mock('./engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./engine')>()
  return {
    ...actual,
    startBral: (...args: Parameters<typeof actual.startBral>) => {
      const state = actual.startBral(...args)
      return opening.override ? { ...state, ...opening.override } : state
    },
  }
})

vi.mock('../useGameScores', () => ({
  useSubmitScore: () => submit,
  usePersonalBest: () => ({ data: null }),
  usePlayerId: () => 'spiller-1',
}))

import { BralGame } from './BralGame'

afterEach(() => {
  cleanup()
  submit.mutate.mockReset()
  opening.override = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('BralGame', () => {
  it('starter først når spilleren trykker Start og bruger store touch-knapper uden scroll', () => {
    render(<BralGame />)

    expect(screen.getByText('Bral smeltning')).toBeTruthy()
    const canvas = screen.getByLabelText('Bral-støberiet')
    expect(canvas.className).toContain('touch-none')

    const bellows = screen.getByRole('button', { name: 'Blæsebælg' })
    const strike = screen.getByRole('button', { name: 'Slå mønt' })
    expect(bellows.hasAttribute('disabled')).toBe(true)
    expect(strike.hasAttribute('disabled')).toBe(true)
    expect(bellows.className).toContain('touch-none')
    expect(strike.className).toContain('touch-none')

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.queryByText('Bral smeltning')).toBeNull()
    expect(bellows.hasAttribute('disabled')).toBe(false)
    expect(bellows.textContent).toContain('650 °C')

    fireEvent.click(bellows)
    expect(bellows.textContent).toContain('718 °C')

    fireEvent.keyDown(window, { key: 'b' })
    expect(bellows.textContent).toContain('786 °C')
    expect(bellows.textContent).toContain('For varm!')
  })

  it('præger mønt med tastatur eller tryk og sender resultatet når tiden løber ud', () => {
    vi.useFakeTimers()
    opening.override = {
      molten: 4,
      markerPos: 0.5,
      timeLeft: 0.08,
      score: 15,
      coins: 2,
    }

    render(<BralGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const strike = screen.getByRole('button', { name: 'Slå mønt' })
    expect(strike.hasAttribute('disabled')).toBe(false)

    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByRole('status').textContent).toContain('Ti Bral')
    expect(submit.mutate).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(screen.getByText('Tiden er gået')).toBeTruthy()
    expect(submit.mutate).toHaveBeenCalledTimes(1)
    expect(submit.mutate).toHaveBeenCalledWith({
      score: 25,
      lines: 3,
      level: 1,
      durationSeconds: expect.any(Number),
    })
  })

  it('fyrer kun én handling ved langt tryk (> 500 ms) på Blæsebælg og Slå mønt', () => {
    vi.useFakeTimers()
    opening.override = {
      molten: 8,
      markerPos: 0.5,
      ovenTemp: 650,
    }

    render(<BralGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const bellows = screen.getByRole('button', { name: 'Blæsebælg' })
    fireEvent.pointerDown(bellows)
    expect(bellows.textContent).toContain('718 °C')

    act(() => {
      vi.advanceTimersByTime(650)
    })

    const tempBeforeClick = bellows.textContent
    fireEvent.pointerUp(bellows)
    fireEvent.click(bellows)
    expect(bellows.textContent).toBe(tempBeforeClick)

    const strike = screen.getByRole('button', { name: 'Slå mønt' })
    fireEvent.pointerDown(strike)
    const pointAfterPointerDown = screen
      .getByText('Point')
      .parentElement?.textContent?.replace('Point', '')
    act(() => {
      vi.advanceTimersByTime(650)
    })
    fireEvent.pointerUp(strike)
    fireEvent.click(strike)

    expect(
      screen
        .getByText('Mønter')
        .parentElement?.textContent?.replace('Mønter', ''),
    ).toBe('1')
    expect(
      screen
        .getByText('Point')
        .parentElement?.textContent?.replace('Point', ''),
    ).toBe(pointAfterPointerDown)
  })

  it('tæller ikke tid med mens fanen er skjult i durationSeconds', () => {
    vi.useFakeTimers()
    let frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const flushFrame = () => {
      const pending = frames
      frames = []
      const now = performance.now()
      for (const cb of pending) cb(now)
    }

    opening.override = {
      timeLeft: 0.2,
      elapsedSeconds: 59.8,
      score: 25,
      coins: 3,
    }

    render(<BralGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    act(() => {
      vi.advanceTimersByTime(100)
      flushFrame()
    })
    expect(submit.mutate).not.toHaveBeenCalled()

    // Fanen skjules i 90 sekunder uden animation frames; væguret går, men spillet står stille.
    act(() => {
      vi.advanceTimersByTime(90_000)
      flushFrame()
    })

    expect(screen.getByText('Tiden er gået')).toBeTruthy()
    expect(submit.mutate).toHaveBeenCalledTimes(1)
    expect(submit.mutate).toHaveBeenCalledWith({
      score: 25,
      lines: 3,
      level: 1,
      durationSeconds: 60,
    })
  })

  it('lader fokuserede knapper beholde Enter og mellemrum i stedet for at slå mønt', () => {
    opening.override = {
      molten: 4,
      markerPos: 0.5,
      ovenTemp: 650,
    }

    render(<BralGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const bellows = screen.getByRole('button', { name: 'Blæsebælg' })
    bellows.focus()

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      bellows.dispatchEvent(enterEvent)
    })
    expect(enterEvent.defaultPrevented).toBe(false)
    expect(
      screen
        .getByText('Mønter')
        .parentElement?.textContent?.replace('Mønter', ''),
    ).toBe('0')

    fireEvent.click(bellows)
    expect(bellows.textContent).toContain('718 °C')
    expect(
      screen
        .getByText('Mønter')
        .parentElement?.textContent?.replace('Mønter', ''),
    ).toBe('0')

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      bellows.dispatchEvent(spaceEvent)
    })
    expect(spaceEvent.defaultPrevented).toBe(false)
    expect(
      screen
        .getByText('Mønter')
        .parentElement?.textContent?.replace('Mønter', ''),
    ).toBe('0')

    bellows.blur()
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByRole('status').textContent).toContain('Ti Bral')
  })
})
