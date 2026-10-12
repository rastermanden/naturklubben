import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Observation } from '../types'
import { ObservationMap } from './ObservationMap'
import { DEFAULT_ZOOM, DENMARK_CENTER } from './tileMath'

afterEach(cleanup)

for (const name of [
  'setPointerCapture',
  'hasPointerCapture',
  'releasePointerCapture',
]) {
  Object.defineProperty(Element.prototype, name, {
    value: () => false,
    writable: true,
    configurable: true,
  })
}

function observation(overrides: Partial<Observation>): Observation {
  return {
    id: 'o',
    species: 'Rød glente',
    location: 'Mols Bjerge',
    observed_on: '2026-03-01',
    notes: null,
    latitude: 56.22,
    longitude: 10.55,
    photo_id: null,
    photo: null,
    created_by: 'user-a',
    observer: { id: 'user-a', full_name: 'Alice' },
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('ObservationMap', () => {
  it('åbner observationen, når man trykker på en nål', () => {
    render(
      <ObservationMap
        observations={[observation({})]}
        view={{ center: DENMARK_CENTER, zoom: DEFAULT_ZOOM }}
        onViewChange={vi.fn()}
      />,
    )
    const pin = screen.getByRole('button', {
      name: 'Rød glente -- se observation',
    })
    fireEvent.pointerDown(pin, { pointerId: 1 })
    fireEvent.pointerUp(pin, { pointerId: 1 })
    fireEvent.click(pin)
    const dialog = screen.getByRole('dialog', { name: 'Rød glente' })
    expect(dialog.textContent).toContain('Mols Bjerge')
  })

  it('tilpasser udsnittet til nålene, når kortet er målt', () => {
    const onViewChange = vi.fn()
    render(
      <ObservationMap
        observations={[observation({})]}
        view={{ center: DENMARK_CENTER, zoom: DEFAULT_ZOOM }}
        onViewChange={onViewChange}
      />,
    )
    expect(onViewChange).toHaveBeenCalledTimes(1)
  })

  it('viser den medgivne tekst, når ingen observationer har en position', () => {
    render(
      <ObservationMap
        observations={[observation({ latitude: null, longitude: null })]}
        view={{ center: DENMARK_CENTER, zoom: DEFAULT_ZOOM }}
        onViewChange={vi.fn()}
        emptyMessage="Ingen fra 2025."
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('Ingen fra 2025.')
  })
})
