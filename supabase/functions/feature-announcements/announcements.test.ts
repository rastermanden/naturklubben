// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  announcementPayload,
  announcementTag,
  ANNOUNCEMENT_PATH,
  selectAnnouncementRecipients,
  type PushSubscriptionRow,
} from './announcements'

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

describe('selectAnnouncementRecipients', () => {
  const subscriptions = [
    subscription('ja-tak'),
    subscription('nej-tak'),
    subscription('ukendt'),
    subscription('ja-tak', 'ja-tak-computer'),
  ]

  it('sender til alle, der ikke har sagt fra', () => {
    const recipients = selectAnnouncementRecipients({
      subscriptions,
      preferences: new Map([
        ['ja-tak', true],
        ['nej-tak', false],
      ]),
    })

    expect(recipients.map((recipient) => recipient.id)).toEqual([
      'ja-tak-device',
      'ukendt-device',
      'ja-tak-computer',
    ])
  })

  it('rammer alle medlemmets enheder', () => {
    const recipients = selectAnnouncementRecipients({
      subscriptions,
      preferences: new Map([['nej-tak', false]]),
    })

    expect(
      recipients.filter((recipient) => recipient.user_id === 'ja-tak'),
    ).toHaveLength(2)
  })

  it('behandler et medlem uden en gemt præference som ja tak', () => {
    const recipients = selectAnnouncementRecipients({
      subscriptions: [subscription('ukendt')],
      preferences: new Map(),
    })

    expect(recipients).toHaveLength(1)
  })
})

describe('announcementPayload', () => {
  const announcement = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'nyheder-om-nye-funktioner',
    title: 'Du får nu besked, når appen får noget nyt',
    body: 'Nye funktioner dukker op under Nyheder.',
    path: null,
  }

  it('sender nyhedens egen tekst med og åbner Nyheder som standard', () => {
    expect(JSON.parse(announcementPayload(announcement))).toEqual({
      title: announcement.title,
      body: announcement.body,
      tag: announcementTag(announcement.slug),
      path: ANNOUNCEMENT_PATH,
    })
  })

  it('åbner den side, nyheden peger på', () => {
    const payload = JSON.parse(
      announcementPayload({ ...announcement, path: 'chat' }),
    )

    expect(payload.path).toBe('chat')
  })

  it('giver hver nyhed sit eget tag, så den ene ikke erstatter den anden', () => {
    expect(announcementTag('en-nyhed')).not.toBe(announcementTag('en-anden'))
  })
})
