import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from './ChatPage'

const mocks = vi.hoisted(() => ({
  messages: [
    {
      id: 'first',
      user_id: 'other-member',
      content: 'Første besked',
      created_at: '2026-08-23T10:00:00.000Z',
    },
  ],
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'current-member' } } }),
}))

vi.mock('../features/chat/useMessages', () => ({
  useMessages: () => ({
    messagesQuery: {
      data: mocks.messages,
      isPending: false,
      isError: false,
    },
    sendMessage: {
      isPending: false,
      mutate: vi.fn(),
    },
  }),
}))

vi.mock('../features/chat/useOnlinePresence', () => ({
  useOnlinePresence: () => [],
}))

vi.mock('../features/chat/useProfilesMap', () => ({
  useProfilesMap: () => ({ data: {}, refetch: vi.fn() }),
}))

vi.mock('../features/notifications/NotificationToggle', () => ({
  NotificationToggle: () => null,
}))

beforeEach(() => {
  mocks.messages = [
    {
      id: 'first',
      user_id: 'other-member',
      content: 'Første besked',
      created_at: '2026-08-23T10:00:00.000Z',
    },
  ]
  HTMLElement.prototype.scrollTo = vi.fn()
})

afterEach(cleanup)

describe('ChatPage live updates', () => {
  it('uses a live log at the bottom and a separate status when scrolled away', () => {
    const { rerender } = render(<ChatPage />)
    const log = screen.getByRole('log', { name: 'Beskeder' })
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(log.getAttribute('aria-relevant')).toBe('additions')

    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })
    fireEvent.scroll(log)
    expect(log.getAttribute('aria-live')).toBe('off')

    mocks.messages = [
      ...mocks.messages,
      {
        id: 'second',
        user_id: 'other-member',
        content: 'Ny besked',
        created_at: '2026-08-23T10:01:00.000Z',
      },
    ]
    rerender(<ChatPage />)

    expect(screen.getByRole('status').textContent).toBe('1 ny besked')
  })
})
