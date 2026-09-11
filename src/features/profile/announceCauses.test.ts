import { describe, expect, it, vi } from 'vitest'
import { CAUSES } from './causes'
import {
  addedCauses,
  announceCauses,
  causesAnnouncement,
} from './announceCauses'

const chat = vi.hoisted(() => ({ announceInChat: vi.fn() }))
vi.mock('./announceInChat', () => chat)

const [ukraine, regnbue, vaccine] = CAUSES

describe('addedCauses', () => {
  it('finder de mærker, der er kommet til, i listens rækkefølge', () => {
    expect(addedCauses([], ['vaccine', 'ukraine'])).toEqual([ukraine, vaccine])
    expect(addedCauses(['ukraine'], ['ukraine', 'regnbue'])).toEqual([regnbue])
  })

  it('tier, når intet er kommet til -- også når et mærke er taget ned', () => {
    expect(addedCauses(['ukraine'], ['ukraine'])).toEqual([])
    expect(addedCauses(['ukraine', 'regnbue'], ['regnbue'])).toEqual([])
    expect(addedCauses([], [])).toEqual([])
  })
})

describe('causesAnnouncement', () => {
  it('nævner ét, to eller tre mærker på dansk', () => {
    expect(causesAnnouncement([ukraine!])).toBe('har sat 🇺🇦 ved sit navn')
    expect(causesAnnouncement([ukraine!, regnbue!])).toBe(
      'har sat 🇺🇦 og 🏳️‍🌈 ved sit navn',
    )
    expect(causesAnnouncement([ukraine!, regnbue!, vaccine!])).toBe(
      'har sat 🇺🇦, 🏳️‍🌈 og 💉 ved sit navn',
    )
  })
})

describe('announceCauses', () => {
  it('sender beskeden ad chattens vej', async () => {
    await announceCauses('member-id', [regnbue!])
    expect(chat.announceInChat).toHaveBeenCalledWith(
      'member-id',
      'har sat 🏳️‍🌈 ved sit navn',
    )
  })
})
