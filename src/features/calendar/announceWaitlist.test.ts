import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  announcePromotion,
  announceReminder,
  mentionedMembers,
  notifyPromotedMembers,
  promotionAnnouncement,
  promotionCause,
  reminderAnnouncement,
} from './announceWaitlist'

const announceInChat = vi.hoisted(() => vi.fn())
const supabaseMocks = vi.hoisted(() => ({
  functions: { invoke: vi.fn() },
}))

vi.mock('../profile/announceInChat', () => ({ announceInChat }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMocks }))

const profiles = {
  carol: {
    full_name: 'Carol Hansen ',
    pronouns: null,
    causes: [],
    avatar_url: null,
    chat_color: null,
  },
  dave: {
    full_name: null,
    pronouns: null,
    causes: [],
    avatar_url: null,
    chat_color: null,
  },
}

describe('announceWaitlist', () => {
  beforeEach(() => {
    announceInChat.mockReset()
    announceInChat.mockResolvedValue(true)
    supabaseMocks.functions.invoke.mockReset()
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: null,
      error: null,
    })
  })

  it('skriver mentions med profilens navn og et fallback uden navn', () => {
    expect(mentionedMembers(['carol', 'dave', 'x'], profiles)).toEqual([
      { id: 'carol', name: 'Carol Hansen' },
      { id: 'dave', name: 'Medlem' },
      { id: 'x', name: 'Medlem' },
    ])
  })

  it('kalder det kun et afbud, når en deltager gav sin plads fra sig', () => {
    expect(promotionCause('attending', null)).toBe('left')
    expect(promotionCause('attending', 'declined')).toBe('left')
    expect(promotionCause('attending', 'attending')).toBe('freed')
    expect(promotionCause(null, 'declined')).toBe('freed')
    expect(promotionCause(null, 'waitlisted')).toBe('freed')
    expect(promotionCause(null, 'attending')).toBe('freed')
    expect(promotionCause('declined', null)).toBe('freed')
    expect(promotionCause('waitlisted', 'waitlisted')).toBe('freed')
  })

  it('formulerer oprykningen efter, hvad der gav pladsen', () => {
    const carol = { id: 'carol', name: 'Carol Hansen' }
    const dave = { id: 'dave', name: 'Dave' }
    expect(promotionAnnouncement('left', 'Skovtur', [carol])).toEqual({
      content:
        'har meldt afbud til «Skovtur», så @Carol Hansen har fået pladsen fra ventelisten',
      messageType: 'action',
    })
    expect(
      promotionAnnouncement('capRaised', 'Skovtur', [carol, dave]),
    ).toEqual({
      content:
        'har gjort plads til flere på «Skovtur»: @Carol Hansen og @Dave har fået plads fra ventelisten',
      messageType: 'action',
    })
    expect(promotionAnnouncement('left', 'Skovtur', [carol], 2).content).toBe(
      'har meldt afbud til «Skovtur», så @Carol Hansen og 2 andre har fået plads fra ventelisten',
    )
  })

  it('sender en ledig plads uden afsender som almindelig tekst', () => {
    const carol = { id: 'carol', name: 'Carol Hansen' }
    const dave = { id: 'dave', name: 'Dave' }
    expect(promotionAnnouncement('freed', 'Skovtur', [carol])).toEqual({
      content:
        'Der blev en plads ledig til «Skovtur», så @Carol Hansen har fået pladsen fra ventelisten.',
      messageType: 'text',
    })
    expect(promotionAnnouncement('freed', 'Skovtur', [carol, dave])).toEqual({
      content:
        'Der blev pladser ledige til «Skovtur», så @Carol Hansen og @Dave har fået plads fra ventelisten.',
      messageType: 'text',
    })
  })

  it('nævner dem, der mangler at svare, og tæller resten', () => {
    const members = [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Carl' },
    ]
    expect(
      reminderAnnouncement('Skovtur', 'søndag den 20. september', members, 0),
    ).toBe(
      'minder om «Skovtur» søndag den 20. september: @Anna, @Bo og @Carl har ikke svaret endnu. Meld til eller fra i kalenderen.',
    )
    expect(
      reminderAnnouncement('Skovtur', 'søndag den 20. september', members, 5),
    ).toBe(
      'minder om «Skovtur» søndag den 20. september: @Anna, @Bo, @Carl og 5 andre har ikke svaret endnu. Meld til eller fra i kalenderen.',
    )
  })

  it('sender oprykningen som handlingsbesked med de oprykkede som mentions', async () => {
    await announcePromotion('bob', 'left', 'Skovtur', ['carol'], profiles)

    expect(announceInChat).toHaveBeenCalledWith(
      'bob',
      'har meldt afbud til «Skovtur», så @Carol Hansen har fået pladsen fra ventelisten',
      ['carol'],
      'action',
    )
  })

  it('nævner de oprykkede også i den neutrale tekstbesked', async () => {
    await announcePromotion('bob', 'freed', 'Skovtur', ['carol'], profiles)

    expect(announceInChat).toHaveBeenCalledWith(
      'bob',
      'Der blev en plads ledig til «Skovtur», så @Carol Hansen har fået pladsen fra ventelisten.',
      ['carol'],
      'text',
    )
  })

  it('sender ingenting, når ingen rykkede op', async () => {
    await expect(
      announcePromotion('bob', 'left', 'Skovtur', [], profiles),
    ).resolves.toBe(true)

    expect(announceInChat).not.toHaveBeenCalled()
  })

  it('melder, om oprykningen kom i chatten', async () => {
    announceInChat.mockResolvedValueOnce(false)

    await expect(
      announcePromotion('bob', 'left', 'Skovtur', ['carol'], profiles),
    ).resolves.toBe(false)
  })

  it('nævner højst 20 oprykkede og tæller resten', async () => {
    const promotedIds = Array.from({ length: 22 }, (_, index) => `m${index}`)

    await announcePromotion(
      'alice',
      'capRaised',
      'Skovtur',
      promotedIds,
      undefined,
    )

    const [, content, mentions, messageType] = announceInChat.mock.calls[0]
    expect(mentions).toEqual(promotedIds.slice(0, 20))
    expect(messageType).toBe('action')
    expect(content).toBe(
      `har gjort plads til flere på «Skovtur»: ${promotedIds
        .slice(0, 19)
        .map(() => '@Medlem')
        .join(', ')}, @Medlem og 2 andre har fået plads fra ventelisten`,
    )
  })

  it('nævner højst 20 i påmindelsen og tæller resten', async () => {
    const memberIds = Array.from({ length: 23 }, (_, index) => `m${index}`)

    await announceReminder(
      'alice',
      { title: 'Skovtur', start_at: '2026-09-20T12:00:00Z' },
      memberIds,
      undefined,
    )

    const [userId, content, mentions] = announceInChat.mock.calls[0]
    expect(userId).toBe('alice')
    expect(mentions).toEqual(memberIds.slice(0, 20))
    expect(content).toContain('og 3 andre har ikke svaret endnu')
    expect(content).toMatch(/^minder om «Skovtur» søndag 20\. september kl\. /)
  })

  it('beder calendar-push give de oprykkede en push', async () => {
    await notifyPromotedMembers('event-1', ['carol', 'dave'])

    expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith(
      'calendar-push',
      {
        body: {
          kind: 'waitlist_promoted',
          eventId: 'event-1',
          userIds: ['carol', 'dave'],
        },
      },
    )
  })

  it('sender ingen push, når ingen rykkede op', async () => {
    await notifyPromotedMembers('event-1', [])

    expect(supabaseMocks.functions.invoke).not.toHaveBeenCalled()
  })

  it('en fejlet push vælter ikke resten -- bedste indsats', async () => {
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('nede'),
    })

    await expect(
      notifyPromotedMembers('event-1', ['carol']),
    ).resolves.toBeUndefined()
  })
})
