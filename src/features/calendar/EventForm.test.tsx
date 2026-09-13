import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventForm } from './EventForm'
import type { CalendarEvent } from './useEvents'
import { parseMaxParticipants } from './waitlist'

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
      'Sluttidspunktet må ikke være før starttidspunktet.',
    )
    expect(end.getAttribute('aria-invalid')).toBe('true')
    expect(end.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(end)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts an omitted end time and an end time equal to the start', () => {
    const onSubmit = vi.fn()
    const { unmount } = render(
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
    fireEvent.submit(screen.getByLabelText('Starter').closest('form')!)

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ end_at: null }),
    )
    unmount()

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
    fireEvent.change(screen.getByLabelText('Slutter'), {
      target: { value: '2026-08-24T10:00' },
    })
    fireEvent.submit(screen.getByLabelText('Slutter').closest('form')!)

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start_at: new Date('2026-08-24T10:00').toISOString(),
        end_at: new Date('2026-08-24T10:00').toISOString(),
      }),
    )
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

  it('submits the public flag so organisers can open an event to non-members', () => {
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
      target: { value: 'Åben skovtur' },
    })
    fireEvent.change(screen.getByLabelText('Starter'), {
      target: { value: '2026-10-03T10:00' },
    })
    const isPublic = screen.getByLabelText(/Åben for ikke-medlemmer/)
    expect((isPublic as HTMLInputElement).checked).toBe(false)
    fireEvent.click(isPublic)
    fireEvent.submit(screen.getByLabelText('Titel').closest('form')!)

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Åben skovtur', is_public: true }),
    )
  })
})

describe('EventForm max participants', () => {
  function renderForm(onSubmit = vi.fn(), event?: CalendarEvent) {
    render(
      <EventForm
        event={event}
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
    return onSubmit
  }

  it('sends an empty field as no cap', () => {
    const onSubmit = renderForm()
    fireEvent.submit(screen.getByLabelText('Starter').closest('form')!)

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ max_participants: null }),
    )
  })

  it('sends a whole number as the cap', () => {
    const onSubmit = renderForm()
    fireEvent.change(screen.getByLabelText('Max antal deltagere'), {
      target: { value: '12' },
    })
    fireEvent.submit(screen.getByLabelText('Starter').closest('form')!)

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ max_participants: 12 }),
    )
  })

  it('rejects zero and links the error to the field', async () => {
    const onSubmit = renderForm()
    const max = screen.getByLabelText('Max antal deltagere')
    fireEvent.change(max, { target: { value: '0' } })
    fireEvent.submit(max.closest('form')!)

    const error = await screen.findByText(
      'Antal pladser skal være et helt tal på mindst 1.',
    )
    expect(max.getAttribute('aria-invalid')).toBe('true')
    expect(max.getAttribute('aria-describedby')).toBe(error.id)
    expect(document.activeElement).toBe(max)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the existing cap when editing', () => {
    renderForm(vi.fn(), {
      id: 'event-1',
      title: 'Skovtur',
      description: null,
      location: null,
      start_at: '2026-08-24T10:00:00Z',
      end_at: null,
      created_by: 'member-id',
      is_public: false,
      max_participants: 8,
    })

    expect(
      (screen.getByLabelText('Max antal deltagere') as HTMLInputElement).value,
    ).toBe('8')
  })
})

describe('parseMaxParticipants', () => {
  it('maps empty to unlimited, whole numbers to a cap, and the rest to invalid', () => {
    expect(parseMaxParticipants('')).toBeNull()
    expect(parseMaxParticipants('  ')).toBeNull()
    expect(parseMaxParticipants('1')).toBe(1)
    expect(parseMaxParticipants(' 25 ')).toBe(25)
    expect(parseMaxParticipants('0')).toBeUndefined()
    expect(parseMaxParticipants('-3')).toBeUndefined()
    expect(parseMaxParticipants('2.5')).toBeUndefined()
    expect(parseMaxParticipants('abc')).toBeUndefined()
  })
})
