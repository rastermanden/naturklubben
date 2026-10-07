import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestRequestForm } from './GuestRequestForm'

const supabaseMocks = vi.hoisted(() => ({
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

const event = {
  id: '3f2c1a4e-5b6d-4c7e-8f90-1a2b3c4d5e6f',
  title: 'Åben skovtur',
  description: null,
  location: null,
  start_at: '2030-10-03T08:00:00.000Z',
  end_at: null,
}

function renderForm(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <GuestRequestForm event={event} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Navn'), {
    target: { value: 'Gitte Gæst' },
  })
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: 'gitte@example.com' },
  })
}

function edgeFunctionError(status: number, body: Record<string, unknown>) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  }
}

beforeEach(() => {
  supabaseMocks.functions.invoke.mockResolvedValue({
    data: { accepted: true },
    error: null,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GuestRequestForm', () => {
  it('focuses the name field and defaults the party size to one', () => {
    renderForm()

    expect(document.activeElement).toBe(screen.getByLabelText('Navn'))
    expect(
      (screen.getByLabelText('Antal personer') as HTMLInputElement).value,
    ).toBe('1')
  })

  it('rejects an impossible party size before calling the server', async () => {
    renderForm()
    fillForm()
    fireEvent.change(screen.getByLabelText('Antal personer'), {
      target: { value: '0' },
    })
    fireEvent.submit(screen.getByLabelText('Navn').closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Antal personer skal være mellem 1 og 20.',
    )
    expect(supabaseMocks.functions.invoke).not.toHaveBeenCalled()
  })

  it('shows the retry window when the server rate-limits the form', async () => {
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: null,
      error: edgeFunctionError(429, {
        code: 'rate_limited',
        retryAfterSeconds: 600,
      }),
    })
    renderForm()
    fillForm()
    fireEvent.submit(screen.getByLabelText('Navn').closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Der er sendt for mange ansøgninger. Prøv igen om cirka 10 minutter.',
    )
  })

  it('explains when the event no longer takes applications', async () => {
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: null,
      error: edgeFunctionError(404, { code: 'event_unavailable' }),
    })
    renderForm()
    fillForm()
    fireEvent.submit(screen.getByLabelText('Navn').closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Begivenheden tager ikke længere imod ansøgninger.',
    )
  })

  it('moves focus to the close button after a successful submission', async () => {
    const onClose = renderForm()
    fillForm()
    fireEvent.submit(screen.getByLabelText('Navn').closest('form')!)

    const close = await screen.findByRole('button', { name: 'Luk' })
    expect(document.activeElement).toBe(close)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
