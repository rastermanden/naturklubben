import { describe, expect, it, vi } from 'vitest'
import {
  addMessage,
  needsReplyRefetch,
  normalizeMessage,
  removeMessage,
  type Message,
} from './useMessages'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

const parent: Message = {
  id: 'message-1',
  user_id: 'member-1',
  content: 'Vi mødes ved søen.',
  created_at: '2026-08-23T12:00:00.000Z',
  reply_to_message_id: null,
  reply_to: null,
}

describe('message reply data', () => {
  it('normalizes the self relation returned by PostgREST', () => {
    const message = normalizeMessage({
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      created_at: '2026-08-23T12:01:00.000Z',
      reply_to_message_id: parent.id,
      reply_to: [
        {
          id: parent.id,
          user_id: parent.user_id,
          content: parent.content,
        },
      ],
    })

    expect(message.reply_to).toEqual({
      id: parent.id,
      user_id: parent.user_id,
      content: parent.content,
    })
  })

  it('enriches a Realtime insert from the cached parent message', () => {
    const realtimeReply = normalizeMessage({
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      created_at: '2026-08-23T12:01:00.000Z',
      reply_to_message_id: parent.id,
    })

    expect(addMessage([parent], realtimeReply)).toEqual([
      parent,
      {
        ...realtimeReply,
        reply_to: {
          id: parent.id,
          user_id: parent.user_id,
          content: parent.content,
        },
      },
    ])
    expect(needsReplyRefetch([parent], realtimeReply)).toBe(false)
  })

  it('requests joined reply data when the parent is outside the cache', () => {
    const realtimeReply = normalizeMessage({
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      created_at: '2026-08-23T12:01:00.000Z',
      reply_to_message_id: parent.id,
    })

    expect(needsReplyRefetch([], realtimeReply)).toBe(true)
  })

  it('does not duplicate an insert already returned by the send mutation', () => {
    expect(addMessage([parent], parent)).toEqual([parent])
  })

  it('removes a deleted parent without removing its replies', () => {
    const reply: Message = {
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      created_at: '2026-08-23T12:01:00.000Z',
      reply_to_message_id: parent.id,
      reply_to: {
        id: parent.id,
        user_id: parent.user_id,
        content: parent.content,
      },
    }

    expect(removeMessage([parent, reply], parent.id)).toEqual([
      { ...reply, reply_to_message_id: null, reply_to: null },
    ])
  })
})
