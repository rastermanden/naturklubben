import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubscribeDialog } from './SubscribeDialog'
import { googleCalendarUrl, webcalUrl } from './subscribeLinks'

const FEED_URL = 'https://demo.supabase.test/functions/v1/calendar-feed'

const originalClipboard = Object.getOwnPropertyDescriptor(
  window.Navigator.prototype,
  'clipboard',
)

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  cleanup()
  delete (navigator as { clipboard?: unknown }).clipboard
  if (originalClipboard) {
    Object.defineProperty(
      window.Navigator.prototype,
      'clipboard',
      originalClipboard,
    )
  }
})

describe('link helpers', () => {
  it('points the Google Calendar link at the encoded https feed', () => {
    expect(googleCalendarUrl(FEED_URL)).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(FEED_URL)}`,
    )
  })

  it('swaps the scheme for webcal without touching the rest', () => {
    expect(webcalUrl(FEED_URL)).toBe(
      'webcal://demo.supabase.test/functions/v1/calendar-feed',
    )
  })
})

describe('SubscribeDialog', () => {
  it('shows the https feed URL, not a webcal URL, as the copyable link', () => {
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={vi.fn()} />)

    const field = screen.getByLabelText('Kalender-link') as HTMLInputElement
    expect(field.value).toBe(FEED_URL)
    expect(field.readOnly).toBe(true)
  })

  it('copies the feed URL to the clipboard and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Kopiér' }))

    expect(writeText).toHaveBeenCalledWith(FEED_URL)
    expect(await screen.findByText('Link kopieret.')).toBeTruthy()
  })

  it('tells the user to copy manually when the clipboard is unavailable', async () => {
    stubClipboard(undefined)
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Kopiér' }))

    expect(
      await screen.findByText('Kopiér linket manuelt herover.'),
    ).toBeTruthy()
  })

  it('reports a failed copy instead of claiming success', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('nope')) })
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Kopiér' }))

    expect(
      await screen.findByText(
        'Kunne ikke kopiere. Kopiér linket manuelt herover.',
      ),
    ).toBeTruthy()
  })

  it('offers Google Calendar guidance and a prefilled Google link', () => {
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={vi.fn()} />)

    expect(
      screen.getByRole('heading', { name: 'Google Kalender' }),
    ).toBeTruthy()
    expect(screen.getByText('Fra URL')).toBeTruthy()
    const link = screen.getByRole('link', {
      name: 'Åbn Google Kalender med linket',
    })
    expect(link.getAttribute('href')).toBe(googleCalendarUrl(FEED_URL))
  })

  it('keeps webcal as a secondary shortcut for calendar apps', () => {
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={vi.fn()} />)

    const link = screen.getByRole('link', { name: 'Åbn i kalender-app' })
    expect(link.getAttribute('href')).toBe(webcalUrl(FEED_URL))
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<SubscribeDialog feedUrl={FEED_URL} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})
