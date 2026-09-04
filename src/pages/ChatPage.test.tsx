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
  presenceAway: [] as unknown[],
  fetchNextPage: vi.fn(),
  searchFetchNextPage: vi.fn(),
  searchPages: undefined as
    { messages: Message[]; hasMore: boolean }[] | undefined,
  profiles: {
    'other-member': {
      full_name: 'Ada',
      avatar_url: null,
      chat_color: '#15803d',
    },
    'third-member': {
      full_name: 'Åge Bruun',
      avatar_url: null,
      chat_color: '#15803d',
    },
  } as Record<
    string,
    { full_name: string | null; avatar_url: string | null; chat_color: string }
  >,
  messages: [
    {
      id: 'message-1',
      user_id: 'other-member',
      content: 'Skal vi mødes ved søen?',
      mentions: [],
      created_at: '2026-08-23T12:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: null,
      reply_to: null,
    },
  ] as Message[],
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
  useProfilesMap: () => ({ data: mocks.profiles, refetch: vi.fn() }),
}))

vi.mock('../features/chat/useOnlinePresence', () => ({
  useOnlinePresence: (_userId: string, away: unknown) => {
    mocks.presenceAway.push(away)
    return []
  },
}))

vi.mock('../features/chat/OnlineMembers', () => ({
  OnlineMembers: () => null,
}))

vi.mock('../features/notifications/NotificationToggle', () => ({
  NotificationToggle: () => null,
}))

vi.mock('../features/notifications/ChatNotificationPreference', () => ({
  ChatNotificationPreference: () => null,
}))

beforeEach(() => {
  mocks.mutate.mockReset()
  mocks.toggleReaction.mockReset()
  mocks.reactions = []
  mocks.deleteMutate.mockReset()
  mocks.isAdmin = false
  mocks.mutateAsync.mockReset()
  mocks.presenceAway = []
  mocks.fetchNextPage.mockReset()
  mocks.searchPages = undefined
  mocks.profiles = {
    'other-member': {
      full_name: 'Ada',
      avatar_url: null,
      chat_color: '#15803d',
    },
    'third-member': {
      full_name: 'Åge Bruun',
      avatar_url: null,
      chat_color: '#15803d',
    },
  }
  mocks.messages = [
    {
      id: 'message-1',
      user_id: 'other-member',
      content: 'Skal vi mødes ved søen?',
      mentions: [],
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
  it('keeps the page fixed while only the message log scrolls', () => {
    render(<ChatPage />)

    const main = screen.getByRole('main')
    const messageLog = screen.getByRole('log', { name: 'Beskeder' })
    const composer = screen.getByRole('textbox', { name: 'Skriv en besked' })

    expect(main.className).toContain('overflow-hidden')
    expect(messageLog.className).toContain('h-full')
    expect(messageLog.className).toContain('overflow-y-auto')
    expect(composer.closest('form')?.className).toContain('shrink-0')
  })

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

describe('ChatPage slash commands', () => {
  it('sends /slap as an action message and clears the composer', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: '/slap Bo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'slår Bo rundt med en stor ørred',
        replyToMessageId: null,
        messageType: 'action',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Skriv en besked',
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('')
  })

  it('sends /me as an action message with the typed text', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: '/me kigger efter fiskehejren' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'kigger efter fiskehejren',
        replyToMessageId: null,
        messageType: 'action',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('sends /shrug as an ordinary message without a messageType field', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: '/shrug det ved jeg ikke' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'det ved jeg ikke ¯\\_(ツ)_/¯',
        replyToMessageId: null,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('answers /help with a system line only the sender sees', () => {
    render(<ChatPage />)
    const composer = screen.getByRole('textbox', {
      name: 'Skriv en besked',
    }) as HTMLTextAreaElement

    fireEvent.change(composer, { target: { value: '/help' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(composer.value).toBe('')
    expect(screen.getByText(/Kommandoer i chatten/)).toBeTruthy()
    expect(screen.getByText(/\/slap \[navn\]/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Luk systembesked' }))
    expect(screen.queryByText(/Kommandoer i chatten/)).toBeNull()
  })

  it('marks the sender away with /away and clears it with /back', () => {
    render(<ChatPage />)
    const composer = screen.getByRole('textbox', { name: 'Skriv en besked' })

    fireEvent.change(composer, { target: { value: '/away til frokost' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(mocks.presenceAway.at(-1)).toEqual({ message: 'til frokost' })
    expect(screen.getByText(/markeret som væk: til frokost/)).toBeTruthy()

    fireEvent.change(composer, { target: { value: '/back' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.presenceAway.at(-1)).toBeNull()
    expect(screen.getByText(/ikke længere markeret som væk/)).toBeTruthy()
  })

  it('suggests the commands while a slash command is typed', () => {
    render(<ChatPage />)
    const composer = screen.getByRole('textbox', { name: 'Skriv en besked' })

    expect(screen.queryByText('/slap [navn]')).toBeNull()

    fireEvent.change(composer, { target: { value: '/' } })
    expect(screen.getByText('/help')).toBeTruthy()
    expect(screen.getByText('/me <tekst>')).toBeTruthy()
    expect(screen.getByText('/shrug [tekst]')).toBeTruthy()
    expect(screen.getByText('/slap [navn]')).toBeTruthy()

    fireEvent.change(composer, { target: { value: '/sl' } })
    expect(screen.queryByText('/me <tekst>')).toBeNull()
    expect(screen.getByText('/slap [navn]')).toBeTruthy()

    fireEvent.change(composer, { target: { value: 'Hej med jer' } })
    expect(screen.queryByText('/slap [navn]')).toBeNull()
  })

  it('completes the command from the hint and from Tab', () => {
    render(<ChatPage />)
    const composer = screen.getByRole('textbox', {
      name: 'Skriv en besked',
    }) as HTMLTextAreaElement

    fireEvent.change(composer, { target: { value: '/sl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Indsæt /slap' }))
    expect(composer.value).toBe('/slap ')

    fireEvent.change(composer, { target: { value: '/m' } })
    fireEvent.keyDown(composer, { key: 'Tab' })
    expect(composer.value).toBe('/me ')
  })

  it('leaves Tab alone when the command is already complete', () => {
    render(<ChatPage />)
    const composer = screen.getByRole('textbox', {
      name: 'Skriv en besked',
    }) as HTMLTextAreaElement

    fireEvent.change(composer, { target: { value: '/slap Bo' } })
    fireEvent.keyDown(composer, { key: 'Tab' })
    expect(composer.value).toBe('/slap Bo')
  })

  it('sends a normal message without a messageType field', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: 'Hej med jer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'Hej med jer',
        replyToMessageId: null,
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
        mentions: [],
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
          mentions: [],
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

describe('ChatPage mentions', () => {
  it('suggests members while a mention is typed and inserts the chosen name', () => {
    render(<ChatPage />)

    const composer = screen.getByRole('textbox', { name: 'Skriv en besked' })
    fireEvent.change(composer, { target: { value: 'Hej @a' } })

    expect(screen.getByRole('button', { name: 'Nævn Ada' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nævn Ada' }))

    expect((composer as HTMLTextAreaElement).value).toBe('Hej @Ada ')
    expect(document.activeElement).toBe(composer)
  })

  it('matches Danish letters however the name is capitalised', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: '@åge' },
    })

    expect(screen.getByRole('button', { name: 'Nævn Åge Bruun' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nævn Ada' })).toBeNull()
  })

  it('picks a member with the keyboard instead of sending the message', () => {
    render(<ChatPage />)

    const composer = screen.getByRole('textbox', { name: 'Skriv en besked' })
    fireEvent.change(composer, { target: { value: 'Hej @' } })
    fireEvent.keyDown(composer, { key: 'ArrowDown' })
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(mocks.mutate).not.toHaveBeenCalled()
    expect((composer as HTMLTextAreaElement).value).toBe('Hej @Åge Bruun ')
  })

  it('closes the list with Escape so Enter sends the message again', () => {
    render(<ChatPage />)

    const composer = screen.getByRole('textbox', { name: 'Skriv en besked' })
    fireEvent.change(composer, { target: { value: 'Hej @a' } })
    fireEvent.keyDown(composer, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: 'Nævn Ada' })).toBeNull()

    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hej @a' }),
      expect.anything(),
    )
  })

  it('sends the mentioned member ids resolved from the text', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: 'Hej @Ada, kommer du?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'Hej @Ada, kommer du?',
        replyToMessageId: null,
        mentions: ['other-member'],
      },
      expect.anything(),
    )
  })

  it('sends no mentions field for a message that names nobody', () => {
    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: 'Skriv til ada@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        userId: 'current-member',
        content: 'Skriv til ada@example.com',
        replyToMessageId: null,
      },
      expect.anything(),
    )
  })

  it('says so when there is nobody else to mention yet', () => {
    // Er man alene i klubben -- fx på et frisk preview -- ville en tom liste
    // være til at forveksle med, at der slet ingen autocomplete er.
    mocks.profiles = {
      'current-member': {
        full_name: 'Mig Selv',
        avatar_url: null,
        chat_color: '#15803d',
      },
    }

    render(<ChatPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Skriv en besked' }), {
      target: { value: 'Hej @' },
    })

    expect(
      screen.getByText('Der er ingen andre medlemmer at nævne endnu.'),
    ).toBeTruthy()
  })

  it('marks a message that mentions the reader', () => {
    mocks.messages = [
      {
        id: 'message-1',
        user_id: 'other-member',
        content: 'Hej, kommer du?',
        mentions: ['current-member'],
        created_at: '2026-08-23T12:00:00.000Z',
        deleted_at: null,
        deleted_by: null,
        reply_to_message_id: null,
        reply_to: null,
      },
    ]

    render(<ChatPage />)

    expect(screen.getByText('Du er nævnt')).toBeTruthy()
  })
})
