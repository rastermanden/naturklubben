import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../features/chat/useMessages'
import ChatPage from './ChatPage'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toggleReaction: vi.fn(),
  reactions: [] as { message_id: string; user_id: string; emoji: string }[],
  deleteMutate: vi.fn(),
  isAdmin: false,
  mutateAsync: vi.fn(),
  fetchNextPage: vi.fn(),
  searchFetchNextPage: vi.fn(),
  searchPages: undefined as
    { messages: Message[]; hasMore: boolean }[] | undefined,
  messages: [
    {
      id: 'message-1',
      user_id: 'other-member',
      content: 'Skal vi mødes ved søen?',
      created_at: '2026-08-23T12:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: null,
      reply_to: null,
    },
  ] satisfies Message[],
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'current-member' } } }),
}))

vi.mock('../features/chat/useMessages', () => ({
  useMessages: () => ({
    messagesQuery: {
      data: { messages: mocks.messages, pages: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
    },
    sendMessage: {
      mutate: mocks.mutate,
      isPending: false,
    },
    deleteMessage: {
      mutate: mocks.deleteMutate,
      isPending: false,
      variables: undefined,
    },
    openMessage: {
      mutateAsync: mocks.mutateAsync,
      isPending: false,
      isError: false,
    },
  }),
  useMessageSearch: () => ({
    data: mocks.searchPages ? { pages: mocks.searchPages } : undefined,
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mocks.searchFetchNextPage,
  }),
}))

vi.mock('../features/chat/useReactions', () => ({
  useReactions: () => ({
    reactions: mocks.reactions,
    toggleReaction: { mutate: mocks.toggleReaction },
  }),
}))

vi.mock('../features/admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: mocks.isAdmin, loading: false }),
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
  mocks.toggleReaction.mockReset()
  mocks.reactions = []
  mocks.deleteMutate.mockReset()
  mocks.isAdmin = false
  mocks.mutateAsync.mockReset()
  mocks.fetchNextPage.mockReset()
  mocks.searchPages = undefined
  mocks.messages = [
    {
      id: 'message-1',
      user_id: 'other-member',
      content: 'Skal vi mødes ved søen?',
      created_at: '2026-08-23T12:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: null,
      reply_to: null,
    },
  ]
  HTMLElement.prototype.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

describe('ChatPage reactions', () => {
  it('adds a reaction the member has not given yet', () => {
    render(<ChatPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Reagér på besked fra Ada' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reagér med 👍' }))

    expect(mocks.toggleReaction).toHaveBeenCalledWith({
      messageId: 'message-1',
      emoji: '👍',
      reactedByMe: false,
    })
  })

  it('removes the member’s own reaction and names who else reacted', () => {
    mocks.reactions = [
      { message_id: 'message-1', user_id: 'current-member', emoji: '👍' },
      { message_id: 'message-1', user_id: 'other-member', emoji: '👍' },
    ]
    render(<ChatPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Fjern din 👍-reaktion. Dig, Ada' }),
    )

    expect(mocks.toggleReaction).toHaveBeenCalledWith({
      messageId: 'message-1',
      emoji: '👍',
      reactedByMe: true,
    })
  })
})

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
        id: 'message-2',
        user_id: 'other-member',
        content: 'Ny besked',
        created_at: '2026-08-23T12:01:00.000Z',
        deleted_at: null,
        deleted_by: null,
        reply_to_message_id: null,
        reply_to: null,
      },
    ]
    rerender(<ChatPage />)

    expect(screen.getByRole('status').textContent).toBe('1 ny besked')
  })

  it('loads older messages without counting them as new', async () => {
    mocks.fetchNextPage.mockImplementation(async () => {
      mocks.messages = [
        {
          id: 'message-0',
          user_id: 'other-member',
          content: 'Ældre besked',
          created_at: '2026-08-23T11:59:00.000Z',
          deleted_at: null,
          deleted_by: null,
          reply_to_message_id: null,
          reply_to: null,
        },
        ...mocks.messages,
      ]
    })
    const { rerender } = render(<ChatPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Hent ældre beskeder' }))
    await mocks.fetchNextPage.mock.results[0]?.value
    rerender(<ChatPage />)

    expect(screen.queryByText('1 ny besked')).toBeNull()
  })
})

describe('ChatPage history search', () => {
  it('opens a server-side result in its message context', async () => {
    mocks.searchPages = [{ messages: mocks.messages, hasMore: false }]
    mocks.mutateAsync.mockResolvedValue(undefined)
    render(<ChatPage />)

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Søg i beskeder' }),
      {
        target: { value: 'søen' },
      },
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Ada.*Skal vi mødes ved søen/ }),
    )

    expect(mocks.mutateAsync).toHaveBeenCalledWith('message-1')
  })
})

describe('ChatPage deletion authorization', () => {
  it('lets a member delete only their own message after confirmation', () => {
    mocks.messages = [
      ...mocks.messages,
      {
        ...mocks.messages[0],
        id: 'own-message',
        user_id: 'current-member',
        content: 'Min besked',
      },
    ]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ChatPage />)

    expect(
      screen.queryByRole('button', { name: 'Slet besked fra Ada' }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Slet besked fra Medlem' }),
    )

    expect(confirm.mock.calls[0]?.[0]).toContain('kan ikke gendannes')
    expect(mocks.deleteMutate).toHaveBeenCalledWith(
      'own-message',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('lets an administrator moderate another member message', () => {
    mocks.isAdmin = true
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ChatPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Slet besked fra Ada' }))

    expect(confirm.mock.calls[0]?.[0]).toContain('som administrator')
    expect(mocks.deleteMutate).toHaveBeenCalledWith(
      'message-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })
})
