// Den ventende besked (#219): de tre tilstande, brugeren kan møde, og de to
// handlinger, der hører til dem.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueuedMessage, type QueuedMessage } from './offlineQueue'
import { PendingMessage } from './PendingMessage'
import type { Message } from './useMessages'

const author = {
  full_name: 'Ada',
  pronouns: null,
  causes: [],
  avatar_url: null,
  chat_color: '#15803d',
}

function queued(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    ...createQueuedMessage(
      {
        userId: 'current-member',
        room: 'general',
        content: 'Mød mig ved søen',
      },
      'client-1',
      '2026-09-17T09:00:00.000Z',
    ),
    ...overrides,
  }
}

function renderPending(
  entry: QueuedMessage,
  handlers: {
    onRetry?: (clientId: string) => void
    onDiscard?: (clientId: string) => void
    replyTo?: Message | null
    replyToName?: string | null
  } = {},
) {
  return render(
    <ul>
      <PendingMessage
        entry={entry}
        author={author}
        replyTo={handlers.replyTo}
        replyToName={handlers.replyToName}
        onRetry={handlers.onRetry ?? vi.fn()}
        onDiscard={handlers.onDiscard ?? vi.fn()}
      />
    </ul>,
  )
}

afterEach(cleanup)

describe('PendingMessage', () => {
  it('viser beskeden med "sendes, når du er online" og skrivetidspunktet', () => {
    renderPending(queued())

    expect(screen.getByText('Mød mig ved søen')).toBeTruthy()
    expect(screen.getByText('Sendes, når du er online')).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-09-17T09:00:00.000Z',
    )
  })

  it('siger "Sender …" mens forsøget kører, og lader ikke beskeden sendes igen imens', () => {
    renderPending(queued({ status: 'sending' }))

    expect(screen.getByText('Sender …')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /Prøv igen/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('viser, at beskeden ikke kunne sendes, med fejlen som forklaring', () => {
    renderPending(
      queued({ status: 'failed', attempts: 1, lastError: 'Failed to fetch' }),
    )

    expect(screen.getByText('Kunne ikke sendes')).toBeTruthy()
    expect(screen.getByTitle('Failed to fetch')).toBeTruthy()
  })

  it('sender klient-id med, når man beder om et nyt forsøg', () => {
    const onRetry = vi.fn()
    renderPending(queued({ status: 'failed' }), { onRetry })

    fireEvent.click(screen.getByRole('button', { name: /Prøv igen/ }))

    expect(onRetry).toHaveBeenCalledWith('client-1')
  })

  it('lader beskeden blive slettet, så den ikke sendes alligevel', () => {
    const onDiscard = vi.fn()
    renderPending(queued(), { onDiscard })

    fireEvent.click(screen.getByRole('button', { name: /^Slet/ }))

    expect(onDiscard).toHaveBeenCalledWith('client-1')
  })

  it('viser, hvad der svares på, når svaret selv ligger i køen', () => {
    const parent: Message = {
      id: 'message-1',
      user_id: 'other-member',
      content: 'Skal vi mødes ved søen?',
      mentions: [],
      created_at: '2026-09-17T08:00:00.000Z',
      written_at: null,
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: null,
      reply_to: null,
    }

    renderPending(queued({ replyToMessageId: 'message-1' }), {
      replyTo: parent,
      replyToName: 'Bo',
    })

    expect(screen.getByText('Svarer Bo')).toBeTruthy()
    expect(screen.getByText('Skal vi mødes ved søen?')).toBeTruthy()
  })
})
