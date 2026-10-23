import { describe, expect, it } from 'vitest'
import {
  dayPosition,
  eventDays,
  formatEventTimeShort,
  formatEventWhen,
  isMultiDay,
} from './eventDays'

function at(...parts: [number, number, number, number?, number?]) {
  const [year, month, day, hour = 0, minute = 0] = parts
  return new Date(year, month, day, hour, minute).getTime()
}

const weekend = { startAt: at(2026, 9, 2, 16), endAt: at(2026, 9, 4, 14) }
const evening = { startAt: at(2026, 9, 2, 18), endAt: at(2026, 9, 2, 21) }
const noEnd = { startAt: at(2026, 9, 2, 10), endAt: null }

describe('eventDays', () => {
  it('dækker hver dag fra fredag til søndag', () => {
    expect(eventDays(weekend)).toEqual([
      new Date(2026, 9, 2),
      new Date(2026, 9, 3),
      new Date(2026, 9, 4),
    ])
  })

  it('giver én dag for en endagsbegivenhed og en uden slut', () => {
    expect(eventDays(evening)).toEqual([new Date(2026, 9, 2)])
    expect(eventDays(noEnd)).toEqual([new Date(2026, 9, 2)])
  })

  it('tæller ikke dagen med, når begivenheden slutter præcis ved midnat', () => {
    expect(
      eventDays({ startAt: at(2026, 9, 2, 18), endAt: at(2026, 9, 3, 0) }),
    ).toEqual([new Date(2026, 9, 2)])
  })

  it('tæller dage på kalenderen hen over skiftet til vintertid', () => {
    // Sidste søndag i oktober 2026 er d. 25.: det døgn har 25 timer.
    expect(
      eventDays({ startAt: at(2026, 9, 24, 10), endAt: at(2026, 9, 26, 9) }),
    ).toEqual([
      new Date(2026, 9, 24),
      new Date(2026, 9, 25),
      new Date(2026, 9, 26),
    ])
  })

  it('krydser et månedsskifte', () => {
    expect(
      eventDays({ startAt: at(2026, 9, 31, 10), endAt: at(2026, 10, 1, 15) }),
    ).toEqual([new Date(2026, 9, 31), new Date(2026, 10, 1)])
  })
})

describe('isMultiDay og dayPosition', () => {
  it('kender første, midterste og sidste dag', () => {
    expect(isMultiDay(weekend)).toBe(true)
    expect(dayPosition(weekend, new Date(2026, 9, 2))).toBe('first')
    expect(dayPosition(weekend, new Date(2026, 9, 3))).toBe('middle')
    expect(dayPosition(weekend, new Date(2026, 9, 4))).toBe('last')
  })

  it('er single for en endagsbegivenhed', () => {
    expect(isMultiDay(evening)).toBe(false)
    expect(dayPosition(evening, new Date(2026, 9, 2))).toBe('single')
  })
})

describe('formatering', () => {
  it('skriver kun sluttidspunktet, når det er samme dag', () => {
    const text = formatEventWhen(evening)
    expect(text).toMatch(/^Fredag/)
    expect(text).not.toMatch(/søndag/)
    expect(text).toMatch(/kl\. 18.00 – 21.00$/)
  })

  it('skriver slutdatoen ud for en flerdagsbegivenhed', () => {
    const text = formatEventWhen(weekend)
    expect(text).toMatch(/^Fredag/)
    expect(text).toMatch(/– søndag .*4\. oktober 2026, kl\. 14.00$/)
  })

  it('har intet sluttidspunkt uden endAt', () => {
    expect(formatEventWhen(noEnd)).toMatch(/kl\. 10.00$/)
  })

  it('giver den korte udgave til listen', () => {
    expect(formatEventTimeShort(evening)).toBe('kl. 18.00')
    expect(formatEventTimeShort(weekend)).toMatch(
      /^kl\. 16.00 – søn\. 4\. okt\. kl\. 14.00$/,
    )
  })
})
