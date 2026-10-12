import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlippyMapCore } from './SlippyMapCore'
import { DENMARK_CENTER, DEFAULT_ZOOM, type MapView } from './tileMath'

afterEach(cleanup)

// jsdom har ingen aktive pekere og definerer slet ikke
// setPointerCapture/hasPointerCapture/releasePointerCapture -- et kald ville
// derfor smide. Stub dem ud, så vi kan køre peker-gestuserne (pan/tap/pinch)
// i testene; de eksisterer altid i en rigtig browser.
const setPointerCapture = vi.fn()

function stubPointerCapture() {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    value: setPointerCapture,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    value: () => false,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    value: () => {},
    writable: true,
    configurable: true,
  })
}

describe('SlippyMapCore', () => {
  stubPointerCapture()

  function renderMap(onViewChange = vi.fn(), onTap = vi.fn()) {
    const view: MapView = {
      center: DENMARK_CENTER,
      zoom: DEFAULT_ZOOM,
    }
    render(
      <SlippyMapCore
        view={view}
        onViewChange={onViewChange}
        onTap={onTap}
        render={() => null}
      />,
    )
    return { onViewChange, onTap }
  }

  it('kalder onTap ved et tryk og committer ikke den uændrede visning bagefter', () => {
    const { onViewChange, onTap } = renderMap()
    const map = screen.getByRole('region')

    fireEvent.pointerDown(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 320,
      clientY: 100,
    })
    fireEvent.pointerUp(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 320,
      clientY: 100,
    })

    expect(onTap).toHaveBeenCalledTimes(1)
    const position = onTap.mock.calls[0][0]
    expect(position).toEqual(
      expect.objectContaining({
        lat: expect.any(Number),
        lng: expect.any(Number),
      }),
    )
    // Regression: en tap må ikke bagefter blive overskrevet af at genhævde
    // gestus-visningen, ellers flytter PositionMapPicker aldrig nålen.
    expect(onViewChange).not.toHaveBeenCalled()
  })

  it('kalder onViewChange med en ny center efter et pan', () => {
    const { onViewChange } = renderMap()
    const map = screen.getByRole('region')

    fireEvent.pointerDown(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
    })
    fireEvent.pointerUp(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
    })

    expect(onViewChange).toHaveBeenCalledTimes(1)
    const next = onViewChange.mock.calls[0][0] as MapView
    expect(next.zoom).toBe(DEFAULT_ZOOM)
    expect(next.center.lng).toBeLessThan(DENMARK_CENTER.lng)
  })

  it('zoomer ind ved en pinch', () => {
    const { onViewChange, onTap } = renderMap()
    const map = screen.getByRole('region')

    fireEvent.pointerDown(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 80,
      clientY: 100,
    })
    fireEvent.pointerDown(map, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 120,
      clientY: 100,
    })
    fireEvent.pointerMove(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 60,
      clientY: 100,
    })
    fireEvent.pointerMove(map, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 140,
      clientY: 100,
    })
    fireEvent.pointerUp(map, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 140,
      clientY: 100,
    })
    fireEvent.pointerUp(map, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 60,
      clientY: 100,
    })

    expect(onViewChange).toHaveBeenCalled()
    const next = onViewChange.mock.calls.at(-1)![0] as MapView
    expect(next.zoom).toBe(DEFAULT_ZOOM + 1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('behandler små rystelser under et tryk som et tryk, ikke et pan', () => {
    const { onViewChange, onTap } = renderMap()
    const map = screen.getByRole('region')
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 103, clientY: 102 })
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 103, clientY: 102 })
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onViewChange).not.toHaveBeenCalled()
  })

  it('fanger ikke pegeren, når trykket starter på en knap i kortet', () => {
    // Fanger kortet pegeren, sender en rigtig browser klikket til kortet i
    // stedet for knappen -- så zoom-knapper og nåle aldrig reagerer.
    setPointerCapture.mockClear()
    const { onViewChange, onTap } = renderMap()
    const zoomIn = screen.getByRole('button', { name: 'Zoom ind' })
    fireEvent.pointerDown(zoomIn, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(zoomIn, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.click(zoomIn)
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
    expect(onViewChange).toHaveBeenCalledTimes(1)
    expect((onViewChange.mock.calls[0][0] as MapView).zoom).toBe(
      DEFAULT_ZOOM + 1,
    )
  })
})
