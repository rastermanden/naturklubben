import { describe, expect, it } from 'vitest'
import {
  answerFor,
  bestOptionIds,
  countAnswers,
  draftOptionsPayload,
  formatOptionDate,
  missingResponders,
  sortPolls,
  sortedOptions,
  validateDraft,
  type DatePoll,
  type DatePollAnswer,
  type DatePollOption,
} from './datePolls'

function option(
  id: string,
  position: number,
  votes: [string, DatePollAnswer][] = [],
): DatePollOption {
  return {
    id,
    position,
    starts_at: new Date(2026, 11, 5 + position, 10).toISOString(),
    ends_at: null,
    votes: votes.map(([user_id, answer]) => ({ user_id, answer })),
  }
}

function poll(overrides: Partial<DatePoll> = {}): DatePoll {
  return {
    id: 'poll',
    title: 'Svampetur',
    description: null,
    created_by: 'alice',
    created_at: '2026-11-01T10:00:00Z',
    closed_at: null,
    chosen_option_id: null,
    event_id: null,
    options: [],
    ...overrides,
  }
}

describe('countAnswers og answerFor', () => {
  it('tæller svarene pr. dato', () => {
    const o = option('a', 0, [
      ['alice', 'yes'],
      ['bob', 'yes'],
      ['carl', 'maybe'],
      ['dina', 'no'],
    ])
    expect(countAnswers(o)).toEqual({ yes: 2, maybe: 1, no: 1 })
    expect(answerFor(o, 'carl')).toBe('maybe')
    expect(answerFor(o, 'erik')).toBeNull()
  })
})

describe('bestOptionIds', () => {
  it('vælger datoen med flest "kan"', () => {
    const p = poll({
      options: [
        option('a', 0, [['alice', 'yes']]),
        option('b', 1, [
          ['alice', 'yes'],
          ['bob', 'yes'],
        ]),
      ],
    })
    expect(bestOptionIds(p)).toEqual(['b'])
  })

  it('bruger "kan måske" til at skille lige mange "kan" ad', () => {
    const p = poll({
      options: [
        option('a', 0, [['alice', 'yes']]),
        option('b', 1, [
          ['alice', 'yes'],
          ['bob', 'maybe'],
        ]),
      ],
    })
    expect(bestOptionIds(p)).toEqual(['b'])
  })

  it('giver alle datoer, der står helt lige', () => {
    const p = poll({
      options: [
        option('a', 0, [['alice', 'yes']]),
        option('b', 1, [['bob', 'yes']]),
        option('c', 2, [['carl', 'no']]),
      ],
    })
    expect(bestOptionIds(p)).toEqual(['a', 'b'])
  })

  it('har ingen bedste dato, før nogen kan', () => {
    const p = poll({
      options: [option('a', 0, [['alice', 'no']]), option('b', 1)],
    })
    expect(bestOptionIds(p)).toEqual([])
  })
})

describe('missingResponders', () => {
  it('er de admins, der ikke har svaret på nogen dato', () => {
    const p = poll({
      options: [
        option('a', 0, [['alice', 'yes']]),
        option('b', 1, [['bob', 'no']]),
      ],
    })
    expect(missingResponders(p, ['alice', 'bob', 'carl'])).toEqual(['carl'])
  })
})

describe('sortPolls og sortedOptions', () => {
  it('viser åbne afstemninger først, nyeste øverst', () => {
    const sorted = sortPolls([
      poll({ id: 'old-open', created_at: '2026-10-01T00:00:00Z' }),
      poll({
        id: 'closed',
        created_at: '2026-11-02T00:00:00Z',
        closed_at: '2026-11-03T00:00:00Z',
      }),
      poll({ id: 'new-open', created_at: '2026-10-20T00:00:00Z' }),
    ])
    expect(sorted.map((p) => p.id)).toEqual(['new-open', 'old-open', 'closed'])
  })

  it('holder datoerne i den rækkefølge, de blev givet', () => {
    const p = poll({ options: [option('b', 1), option('a', 0)] })
    expect(sortedOptions(p).map((o) => o.id)).toEqual(['a', 'b'])
  })
})

describe('validateDraft', () => {
  const two = [
    { start: '2026-12-05T10:00', end: '' },
    { start: '2026-12-06T10:00', end: '' },
  ]

  it('godtager et navn og to datoer', () => {
    expect(
      validateDraft({ title: 'Tur', description: '', options: two }),
    ).toBeNull()
  })

  it('kræver et navn', () => {
    expect(
      validateDraft({ title: '  ', description: '', options: two }),
    ).toMatch(/navn/)
  })

  it('kræver mindst to udfyldte datoer -- tomme rækker tæller ikke', () => {
    expect(
      validateDraft({
        title: 'Tur',
        description: '',
        options: [two[0]!, { start: '', end: '' }],
      }),
    ).toMatch(/mindst 2/)
  })

  it('afviser mere end ti datoer', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      start: `2026-12-${String(i + 1).padStart(2, '0')}T10:00`,
      end: '',
    }))
    expect(
      validateDraft({ title: 'Tur', description: '', options: eleven }),
    ).toMatch(/højst være 10/)
  })

  it('afviser den samme dato to gange', () => {
    expect(
      validateDraft({
        title: 'Tur',
        description: '',
        options: [two[0]!, { ...two[0]! }],
      }),
    ).toMatch(/to gange/)
  })

  it('afviser en dato, der slutter før den starter', () => {
    expect(
      validateDraft({
        title: 'Tur',
        description: '',
        options: [
          { start: '2026-12-05T10:00', end: '2026-12-05T09:00' },
          two[1]!,
        ],
      }),
    ).toMatch(/slutter/)
  })
})

describe('draftOptionsPayload', () => {
  it('sender kun udfyldte datoer, som ISO-tider', () => {
    const payload = draftOptionsPayload([
      { start: '2026-12-05T10:00', end: '2026-12-05T14:00' },
      { start: '', end: '' },
      { start: '2026-12-06T10:00', end: '' },
    ])
    expect(payload).toEqual([
      {
        starts_at: new Date('2026-12-05T10:00').toISOString(),
        ends_at: new Date('2026-12-05T14:00').toISOString(),
      },
      { starts_at: new Date('2026-12-06T10:00').toISOString(), ends_at: null },
    ])
  })
})

describe('formatOptionDate', () => {
  it('skriver kun sluttidspunktet, når det er samme dag', () => {
    const text = formatOptionDate({
      starts_at: new Date(2026, 11, 5, 10).toISOString(),
      ends_at: new Date(2026, 11, 5, 14).toISOString(),
    })
    expect(text).toMatch(/5\. dec\. kl\. 10\.00–14\.00$/)
  })

  it('skriver slutdatoen ud, når den er en anden dag', () => {
    const text = formatOptionDate({
      starts_at: new Date(2026, 11, 5, 10).toISOString(),
      ends_at: new Date(2026, 11, 6, 14).toISOString(),
    })
    expect(text).toMatch(/– søn\. 6\. dec\. kl\. 14\.00$/)
  })
})
