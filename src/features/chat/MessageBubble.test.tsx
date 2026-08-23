import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MessageBubble } from './MessageBubble'

afterEach(cleanup)

describe('MessageBubble', () => {
  it('shows no stable identity for an anonymized message', () => {
    render(
      <MessageBubble
        message={{
          id: 'message-id',
          user_id: null,
          content: 'Fælles historik',
          created_at: new Date().toISOString(),
        }}
        author={undefined}
        isOwn={false}
      />,
    )

    expect(screen.getByText('Tidligere medlem')).toBeTruthy()
    expect(screen.getByText('Fælles historik')).toBeTruthy()
  })
})
