import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../features/chat/useMessages'
import ChatPage from './ChatPage'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'current-member' } } }),
}))

vi.mock('../features/chat/useMessages', () => ({
  useMessages: () => ({
    messagesQuery: {
      data: [
        {
          id: 'message-1',
          user_id: 'other-member',
          content: 'Skal vi mødes ved søen?',
          created_at: '2026-08-23T12:00:00.000Z',
          reply_to_message_id: null,
          reply_to: null,
        },
      ] satisfies Message[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    sendMessage: {
      mutate: mocks.mutate,
      isPending: false,
    },
  }),
}))

vi.mock('../features/chat/useProfilesMap', () => ({
  useProfilesMap: () => ({
    data: {
      'other-member': {
        full_name: 'Ada',
        avatar_url: null,
        chat_color: '#15803d',
      },
    },
    refetch: vi.fn(),
  }),
}))

vi.mock('../features/chat/useOnlinePresence', () => ({
  useOnlinePresence: () => [],
}))

vi.mock('../features/chat/OnlineMembers', () => ({
  OnlineMembers: () => null,
}))

vi.mock('../features/notifications/NotificationToggle', () => ({
  NotificationToggle: () => null,
}))

beforeEach(() => {
  mocks.mutate.mockReset()
  HTMLElement.prototype.scrollTo = vi.fn()
})

afterEach(cleanup)

describe('ChatPage replies', () => {
  it('selects and cancels a reply while keeping focus in the composer', () => {
    render(<ChatPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Svar på besked fra Ada' }),
    )

    const replyComposer = screen.getByRole('textbox', {
      name: 'Skriv et svar til Ada',
    })
    expect(document.activeElement).toBe(replyComposer)
    expect(screen.getByRole('status').textContent).toContain('Svarer Ada')

    fireEvent.click(screen.getByRole('button', { name: 'Annuller svar' }))

    const normalComposer = screen.getByRole('textbox', {
      name: 'Skriv en besked',
    })
    expect(document.activeElement).toBe(normalComposer)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('sends the selected message id with the reply', () => {
    render(<ChatPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Svar på besked fra Ada' }),
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Skriv et svar til Ada' }),
      { target: { value: 'Ja, klokken 18.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'Ja, klokken 18.',
        replyToMessageId: 'message-1',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })
})
