// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  chatPushPayload,
  CHAT_TAG,
  MENTION_TAG,
  normalizePreference,
  selectRecipients,
  type ChatNotificationPreference,
  type PushSubscriptionRow,
} from './recipients'

function subscription(
  userId: string,
  id = `${userId}-device`,
): PushSubscriptionRow {
  return {
    id,
    user_id: userId,
    endpoint: `https://push.example.com/${id}`,
    p256dh: 'p256dh',
    auth: 'auth',
  }
}

function preferencesOf(
  entries: Record<string, ChatNotificationPreference>,
): Map<string, ChatNotificationPreference> {
  return new Map(Object.entries(entries))
}

describe('selectRecipients', () => {
  const subscriptions = [
    subscription('sender'),
    subscription('everything'),
    subscription('only-mentions'),
    subscription('nothing'),
    subscription('unset'),
  ]

  const preferences = preferencesOf({
    sender: 'all',
    everything: 'all',
    'only-mentions': 'mentions',
    nothing: 'none',
  })

  it('sends to everyone but the sender for an ordinary message', () => {
    const recipients = selectRecipients({
      subscriptions,
      preferences,
      mentionedIds: [],
      senderId: 'sender',
    })

    expect(recipients.map((entry) => entry.subscription.user_id)).toEqual([
      'everything',
      'unset',
    ])
    expect(recipients.every((entry) => !entry.isMentioned)).toBe(true)
  })

  it('reaches a member who only wants mentions when they are mentioned', () => {
    const recipients = selectRecipients({
      subscriptions,
      preferences,
      mentionedIds: ['only-mentions'],
      senderId: 'sender',
    })

    expect(
      recipients.map((entry) => [
        entry.subscription.user_id,
        entry.isMentioned,
      ]),
    ).toEqual([
      ['everything', false],
      ['only-mentions', true],
      ['unset', false],
    ])
  })

  it('never sends to a member who has turned the chat off, mention or not', () => {
    const recipients = selectRecipients({
      subscriptions,
      preferences,
      mentionedIds: ['nothing'],
      senderId: 'sender',
    })

    expect(
      recipients.some((entry) => entry.subscription.user_id === 'nothing'),
    ).toBe(false)
  })

  it('treats a missing preference as all messages', () => {
    const recipients = selectRecipients({
      subscriptions: [subscription('unset')],
      preferences: new Map(),
      mentionedIds: [],
      senderId: 'sender',
    })

    expect(recipients).toHaveLength(1)
  })

  it('never notifies the sender, not even on their own other devices', () => {
    const recipients = selectRecipients({
      subscriptions: [subscription('sender', 'phone'), subscription('sender')],
      preferences,
      mentionedIds: ['sender'],
      senderId: 'sender',
    })

    expect(recipients).toEqual([])
  })

  it('sends to every device a member has', () => {
    const recipients = selectRecipients({
      subscriptions: [
        subscription('everything', 'phone'),
        subscription('everything', 'laptop'),
      ],
      preferences,
      mentionedIds: [],
      senderId: 'sender',
    })

    expect(recipients.map((entry) => entry.subscription.id)).toEqual([
      'phone',
      'laptop',
    ])
  })
})

describe('normalizePreference', () => {
  it('keeps the known choices and falls back to all', () => {
    expect(normalizePreference('mentions')).toBe('mentions')
    expect(normalizePreference('none')).toBe('none')
    expect(normalizePreference(null)).toBe('all')
    expect(normalizePreference('vandring')).toBe('all')
  })
})

describe('chatPushPayload', () => {
  it('names the sender on an ordinary message', () => {
    const payload = JSON.parse(
      chatPushPayload({
        senderName: 'Martin ',
        preview: 'Kommer I på lørdag?',
        messageId: 'message-1',
        isMentioned: false,
      }),
    )

    expect(payload).toEqual({
      title: 'Martin',
      body: 'Kommer I på lørdag?',
      tag: CHAT_TAG,
      path: 'chat',
      messageId: 'message-1',
    })
  })

  it('gives a mention its own title and its own tag', () => {
    const payload = JSON.parse(
      chatPushPayload({
        senderName: 'Martin',
        preview: 'Hej @Ada',
        messageId: 'message-2',
        isMentioned: true,
      }),
    )

    expect(payload.title).toBe('Martin nævnte dig')
    // Uden sit eget tag ville den næste almindelige besked erstatte
    // mention-notifikationen i skuffen.
    expect(payload.tag).toBe(MENTION_TAG)
    expect(payload.tag).not.toBe(CHAT_TAG)
  })

  it('still says something sensible when the sender has no name', () => {
    expect(
      JSON.parse(
        chatPushPayload({
          senderName: null,
          preview: 'Hej',
          messageId: 'message-3',
          isMentioned: true,
        }),
      ).title,
    ).toBe('Du er nævnt i Naturklubben')
    expect(
      JSON.parse(
        chatPushPayload({
          senderName: '   ',
          preview: 'Hej',
          messageId: 'message-4',
          isMentioned: false,
        }),
      ).title,
    ).toBe('Ny besked i Naturklubben')
  })
})
