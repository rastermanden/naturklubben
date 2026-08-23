import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message } from './useMessages'
import { MessageBubble } from './MessageBubble'

afterEach(cleanup)

const message: Message = {
  id: 'message-2',
  user_id: 'member-2',
  content: 'God idé!',
  created_at: '2026-08-23T12:01:00.000Z',
  reply_to_message_id: 'message-1',
  reply_to: {
    id: 'message-1',
    user_id: 'member-1',
    content: 'Vi mødes ved søen.',
  },
}

const author = {
  full_name: 'Bo',
  avatar_url: null,
  chat_color: '#166534',
}

const replyAuthor = {
  full_name: 'Ada',
  avatar_url: null,
  chat_color: '#15803d',
}

describe('MessageBubble', () => {
  it('shows the referenced author and message excerpt', () => {
    render(
      <MessageBubble
        message={message}
        author={author}
        replyAuthor={replyAuthor}
        isOwn={false}
        onReply={vi.fn()}
        reactions={[]}
        onToggleReaction={vi.fn()}
      />,
    )

    expect(screen.getByText('Ada').textContent).toBe('Ada')
    expect(screen.getByText('Vi mødes ved søen.').textContent).toBe(
      'Vi mødes ved søen.',
    )
  })

  it('exposes a named reply action', () => {
    const onReply = vi.fn()
    render(
      <MessageBubble
        message={message}
        author={author}
        replyAuthor={replyAuthor}
        isOwn={false}
        onReply={onReply}
        reactions={[]}
        onToggleReaction={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Svar på besked fra Bo' }),
    )

    expect(onReply).toHaveBeenCalledWith(message)
  })

  it('shows a neutral fallback when a live reply parent is unavailable', () => {
    render(
      <MessageBubble
        message={{ ...message, reply_to: null }}
        author={author}
        replyAuthor={undefined}
        isOwn={false}
        onReply={vi.fn()}
        reactions={[]}
        onToggleReaction={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Den oprindelige besked er ikke tilgængelig.')
        .textContent,
    ).toBe('Den oprindelige besked er ikke tilgængelig.')
  })

  it('shows the sender avatar on own messages too', () => {
    const { container } = render(
      <MessageBubble
        message={{ ...message, user_id: 'member-1' }}
        author={{ ...author, avatar_url: 'https://example.test/bo.jpg' }}
        replyAuthor={replyAuthor}
        isOwn
        onReply={vi.fn()}
        reactions={[]}
        onToggleReaction={vi.fn()}
      />,
    )

    const avatar = container.querySelector('img')
    expect(avatar?.getAttribute('src')).toBe('https://example.test/bo.jpg')
  })

  it('opens the reaction picker from the action row and reports the choice', () => {
    const onToggleReaction = vi.fn()
    render(
      <MessageBubble
        message={message}
        author={author}
        replyAuthor={replyAuthor}
        isOwn={false}
        onReply={vi.fn()}
        reactions={[]}
        onToggleReaction={onToggleReaction}
      />,
    )

    // Vælgeren fylder ikke, før den åbnes.
    expect(screen.queryByRole('button', { name: 'Reagér med 👍' })).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Reagér på besked fra Bo' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reagér med 👍' }))

    expect(onToggleReaction).toHaveBeenCalledWith(message, '👍')
    // Vælgeren lukker igen, så boblen ikke bliver stående åben.
    expect(screen.queryByRole('button', { name: 'Reagér med 👍' })).toBeNull()
  })

  it('marks a reaction the member has already given as pressed', () => {
    const onToggleReaction = vi.fn()
    render(
      <MessageBubble
        message={message}
        author={author}
        replyAuthor={replyAuthor}
        isOwn={false}
        onReply={vi.fn()}
        reactions={[
          { emoji: '👍', count: 2, reactedByMe: true, names: ['Dig', 'Ada'] },
        ]}
        onToggleReaction={onToggleReaction}
      />,
    )

    const chip = screen.getByRole('button', {
      name: 'Fjern din 👍-reaktion. Dig, Ada',
    })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.textContent).toContain('2')

    fireEvent.click(chip)
    expect(onToggleReaction).toHaveBeenCalledWith(message, '👍')
  })

  it('shows no stable identity for an anonymized message', () => {
    render(
      <MessageBubble
        message={{
          ...message,
          user_id: null,
          content: 'Fælles historik',
          reply_to_message_id: null,
          reply_to: null,
        }}
        author={undefined}
        replyAuthor={undefined}
        isOwn={false}
        onReply={vi.fn()}
        reactions={[]}
        onToggleReaction={vi.fn()}
      />,
    )

    expect(screen.getByText('Tidligere medlem')).toBeTruthy()
    expect(screen.getByText('Fælles historik')).toBeTruthy()
  })
})
