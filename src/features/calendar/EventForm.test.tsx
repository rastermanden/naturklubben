import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventForm } from './EventForm'

afterEach(cleanup)

describe('EventForm errors', () => {
  it('links an invalid time range to the end field and focuses it', async () => {
    const onSubmit = vi.fn()
    render(
      <EventForm
        submitting={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Titel'), {
      target: { value: 'Morgentur' },
    })
    fireEvent.change(screen.getByLabelText('Starter'), {
      target: { value: '2026-08-24T10:00' },
    })
    const end = screen.getByLabelText('Slutter')
    fireEvent.change(end, { target: { value: '2026-08-24T09:00' } })
    end.focus()
    fireEvent.submit(end.closest('form')!)

    const error = await screen.findByText(
      'Sluttidspunktet skal være efter starttidspunktet.',
    )
    expect(end.getAttribute('aria-invalid')).toBe('true')
    expect(end.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(end)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps submission failures as form-level alerts', () => {
    render(
      <EventForm
        submitting={false}
        error="Begivenheden kunne ikke gemmes."
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByRole('alert').textContent).toBe(
      'Begivenheden kunne ikke gemmes.',
    )
  })
})
