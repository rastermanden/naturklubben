import { describe, expect, it, vi } from 'vitest'
import { PRONOUNS_UNDISCLOSED } from './pronouns'
import {
  announcePronouns,
  pronounsAnnouncement,
  shouldAnnouncePronouns,
} from './announcePronouns'

const chat = vi.hoisted(() => ({ announceInChat: vi.fn() }))
vi.mock('./announceInChat', () => chat)

describe('shouldAnnouncePronouns', () => {
  it('siger til, første gang man vælger, og når man skifter', () => {
    expect(shouldAnnouncePronouns(null, 'hen/hen')).toBe(true)
    expect(shouldAnnouncePronouns('hun/hende', 'de/dem')).toBe(true)
  })

  it('tier, når intet er ændret', () => {
    expect(shouldAnnouncePronouns('hen/hen', 'hen/hen')).toBe(false)
    expect(shouldAnnouncePronouns(null, null)).toBe(false)
  })

  it('tier, når pronominerne fjernes eller ikke oplyses', () => {
    expect(shouldAnnouncePronouns('hen/hen', null)).toBe(false)
    expect(shouldAnnouncePronouns('hen/hen', PRONOUNS_UNDISCLOSED)).toBe(false)
    expect(shouldAnnouncePronouns(null, PRONOUNS_UNDISCLOSED)).toBe(false)
  })
})

describe('announcePronouns', () => {
  it('sender beskeden ad chattens vej', async () => {
    await announcePronouns('member-id', 'hen/hen')
    expect(chat.announceInChat).toHaveBeenCalledWith(
      'member-id',
      pronounsAnnouncement('hen/hen'),
    )
  })
})
