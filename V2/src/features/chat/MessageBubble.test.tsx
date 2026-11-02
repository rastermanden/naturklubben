import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageView } from './types'
import { MessageBubble } from './MessageBubble'

afterEach(cleanup)

function message(pronouns: string | null): MessageView {
  return {
    messageId: 'm1' as MessageView['messageId'],
    room: 'general',
    authorId: 'p1' as MessageView['authorId'],
    authorName: 'Bo',
    authorPronouns: pronouns,
    authorCauses: [],
    chatColor: '#166534',
    avatarUrl: null,
    content: 'Hej',
    messageType: 'text',
    mentions: [],
    createdAt: 1,
    writtenAt: null,
    editedAt: null,
    deletedAt: null,
    deletedByAdmin: false,
    replyTo: null,
    reactions: [],
    poll: null,
  }
}

describe('MessageBubble pronominer', () => {
  it('viser pronominerne lige efter navnet', () => {
    render(
      <MessageBubble
        message={message('hen/hen')}
        isOwn={false}
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    )
    const name = screen.getByText('Bo')
    expect(name.nextElementSibling?.textContent).toBe('hen/hen')
  })

  it('viser ikke "vil ikke oplyse"', () => {
    render(
      <MessageBubble
        message={message('vil ikke oplyse')}
        isOwn={false}
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    )
    expect(screen.queryByText('vil ikke oplyse')).toBeNull()
  })
})
