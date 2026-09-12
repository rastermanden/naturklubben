import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  announcePromotion,
  announceReminder,
  mentionedMembers,
  promotionAnnouncement,
  reminderAnnouncement,
} from './announceWaitlist'

const announceInChat = vi.hoisted(() => vi.fn())

vi.mock('../profile/announceInChat', () => ({ announceInChat }))

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
  })

  it('skriver mentions med profilens navn og et fallback uden navn', () => {
    expect(mentionedMembers(['carol', 'dave', 'x'], profiles)).toEqual([
      { id: 'carol', name: 'Carol Hansen' },
      { id: 'dave', name: 'Medlem' },
      { id: 'x', name: 'Medlem' },
    ])
  })

  it('formulerer oprykningen efter, hvad der gav pladsen', () => {
    const carol = { id: 'carol', name: 'Carol Hansen' }
    const dave = { id: 'dave', name: 'Dave' }
    expect(promotionAnnouncement('left', 'Skovtur', [carol])).toBe(
      'har meldt afbud til «Skovtur», så @Carol Hansen har fået pladsen fra ventelisten',
    )
    expect(promotionAnnouncement('capRaised', 'Skovtur', [carol, dave])).toBe(
      'har gjort plads til flere på «Skovtur»: @Carol Hansen og @Dave har fået plads fra ventelisten',
    )
    expect(promotionAnnouncement('joined', 'Skovtur', [carol])).toBe(
      'har tilmeldt sig «Skovtur» – @Carol Hansen har samtidig fået plads fra ventelisten',
    )
    expect(promotionAnnouncement('left', 'Skovtur', [carol], 2)).toBe(
      'har meldt afbud til «Skovtur», så @Carol Hansen og 2 andre har fået plads fra ventelisten',
    )
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

    const [, content, mentions] = announceInChat.mock.calls[0]
    expect(mentions).toEqual(promotedIds.slice(0, 20))
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
})
