import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state: {
  events: { id: string; title: string; startAt: number }[] | undefined
} = { events: undefined }

vi.mock('convex/react', () => ({
  useQuery: () => state.events,
}))

import { EventPicker } from './EventPicker'

afterEach(cleanup)

const tur = {
  id: 'event1',
  title: 'Hornfisketur',
  // 14. juni 2026, så datoen i parentesen kan læses i testen.
  startAt: Date.UTC(2026, 5, 14, 10),
}

describe('EventPicker', () => {
  it('viser begivenhederne med dato, så to ture med samme navn kan skelnes', () => {
    state.events = [
      tur,
      { ...tur, id: 'event2', startAt: Date.UTC(2025, 5, 14, 10) },
    ]
    render(<EventPicker value="" onChange={vi.fn()} />)

    const field = screen.getByLabelText(
      /Knyt til begivenhed/,
    ) as HTMLSelectElement
    expect(field.disabled).toBe(false)
    expect(
      screen.getByRole('option', { name: 'Hornfisketur (14. jun. 2026)' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'Hornfisketur (14. jun. 2025)' }),
    ).toBeTruthy()
    // "Ingen" er standard, så en upload ikke får en begivenhed, man ikke valgte.
    expect(screen.getByRole('option', { name: 'Ingen' })).toBeTruthy()
  })

  it('melder det valgte id videre', () => {
    state.events = [tur]
    const onChange = vi.fn()
    render(<EventPicker value="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/Knyt til begivenhed/), {
      target: { value: 'event1' },
    })
    expect(onChange).toHaveBeenCalledWith('event1')
  })

  it('er slået fra, mens listen hentes', () => {
    state.events = undefined
    render(<EventPicker value="" onChange={vi.fn()} />)

    const field = screen.getByLabelText(
      /Knyt til begivenhed/,
    ) as HTMLSelectElement
    expect(field.disabled).toBe(true)
    expect(
      screen.getByRole('option', { name: 'Henter begivenheder…' }),
    ).toBeTruthy()
  })

  it('vises slet ikke, når klubben ikke har nogen begivenheder', () => {
    state.events = []
    render(<EventPicker value="" onChange={vi.fn()} />)

    expect(screen.queryByLabelText(/Knyt til begivenhed/)).toBeNull()
  })
})
