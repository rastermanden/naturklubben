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

function field() {
  return screen.getByLabelText(/Knyt til begivenhed/) as HTMLSelectElement
}

describe('EventPicker', () => {
  it('viser begivenhederne med dato, så to ture med samme navn kan skelnes', () => {
    state.events = [
      tur,
      { ...tur, id: 'event2', startAt: Date.UTC(2025, 5, 14, 10) },
    ]
    render(<EventPicker value="" onChange={vi.fn()} />)

    expect(
      screen.getByRole('option', { name: 'Hornfisketur (14. jun. 2026)' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'Hornfisketur (14. jun. 2025)' }),
    ).toBeTruthy()
    // "Ingen" er standard, så en upload ikke får en begivenhed, man ikke valgte.
    expect(screen.getByRole('option', { name: 'Ingen' })).toBeTruthy()
  })

  it('viser den værdi, den får -- ellers ville forvalget ikke slå igennem', () => {
    state.events = [tur, { ...tur, id: 'event2', title: 'Fugletårnet' }]
    render(<EventPicker value="event2" onChange={vi.fn()} />)

    expect(field().value).toBe('event2')
  })

  it('melder det valgte id videre', () => {
    state.events = [tur]
    const onChange = vi.fn()
    render(<EventPicker value="" onChange={onChange} />)

    fireEvent.change(field(), { target: { value: 'event1' } })
    expect(onChange).toHaveBeenCalledWith('event1')
  })

  it('kan bruges, mens listen hentes -- og siger det med aria-busy', () => {
    state.events = undefined
    render(<EventPicker value="" onChange={vi.fn()} />)

    // En `disabled` select er ude af tab-rækkefølgen, så en skærmlæser møder
    // den slet ikke under indlæsningen.
    expect(field().disabled).toBe(false)
    expect(field().getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('option', { name: 'Ingen' })).toBeTruthy()
  })

  it('viser en værdi, der ikke er i listen, frem for at falde tilbage til "Ingen"', () => {
    // Albummets begivenhed kan ligge uden for de nyeste 50 -- eller være et
    // V1-album, hvis nøgle ikke er et begivenheds-id. Feltet må ikke vise
    // "Ingen", mens uploaden knytter begivenheden alligevel.
    state.events = [tur]
    render(
      <EventPicker
        value="gammelt-album"
        valueTitle="Hornfisketur 2024"
        onChange={vi.fn()}
      />,
    )

    expect(field().value).toBe('gammelt-album')
    expect(
      screen.getByRole('option', { name: 'Hornfisketur 2024' }),
    ).toBeTruthy()
  })

  it('vises slet ikke, når klubben ikke har nogen begivenheder', () => {
    state.events = []
    render(<EventPicker value="" onChange={vi.fn()} />)

    expect(screen.queryByLabelText(/Knyt til begivenhed/)).toBeNull()
  })

  it('vises alligevel, når der ingen liste er, men albummet har en begivenhed', () => {
    state.events = []
    render(
      <EventPicker
        value="event1"
        valueTitle="Hornfisketur"
        onChange={vi.fn()}
      />,
    )

    expect(field().value).toBe('event1')
  })
})
