import { describe, expect, it } from 'vitest'
import {
  isAfterPosition,
  readByLabel,
  readersByMessage,
  upsertPosition,
  type ReadPosition,
} from './readReceipts'

const messages = [
  { id: 'm1', user_id: 'alice', created_at: '2026-11-01T10:00:00Z' },
  { id: 'm2', user_id: 'bob', created_at: '2026-11-01T10:01:00Z' },
  { id: 'm3', user_id: 'alice', created_at: '2026-11-01T10:02:00Z' },
]

function position(
  user_id: string,
  last_read_message_id: string | null,
  last_read_at: string,
): ReadPosition {
  return { user_id, room: 'general', last_read_message_id, last_read_at }
}

describe('readersByMessage (#294)', () => {
  it('sætter hver læser under den seneste besked, de har læst', () => {
    const map = readersByMessage(
      messages,
      [
        position('carl', 'm2', '2026-11-01T10:01:00Z'),
        position('dina', 'm3', '2026-11-01T10:02:00Z'),
        position('erik', 'm3', '2026-11-01T10:02:00Z'),
      ],
      'me',
    )
    expect(map.get('m2')).toEqual(['carl'])
    expect(map.get('m3')).toEqual(['dina', 'erik'])
    expect(map.has('m1')).toBe(false)
  })

  it('viser ikke en selv', () => {
    const map = readersByMessage(
      messages,
      [position('me', 'm3', '2026-11-01T10:02:00Z')],
      'me',
    )
    expect(map.size).toBe(0)
  })

  it('viser ikke afsenderen under sin egen besked', () => {
    const map = readersByMessage(
      messages,
      [position('alice', 'm3', '2026-11-01T10:02:00Z')],
      'me',
    )
    expect(map.size).toBe(0)
  })

  it('placerer efter tidspunktet, når positionens besked ikke er indlæst', () => {
    const map = readersByMessage(
      messages,
      [position('carl', 'gone', '2026-11-01T10:01:30Z')],
      'me',
    )
    expect(map.get('m2')).toEqual(['carl'])
  })

  it('viser ikke en position, der ligger før de indlæste beskeder', () => {
    const map = readersByMessage(
      messages,
      [position('carl', 'old', '2026-10-01T10:00:00Z')],
      'me',
    )
    expect(map.size).toBe(0)
  })
})

describe('isAfterPosition', () => {
  it('er sand uden en position', () => {
    expect(isAfterPosition(messages[0]!, undefined)).toBe(true)
  })

  it('følger tidspunktet og ved lighed id', () => {
    const at = position('me', 'm2', '2026-11-01T10:01:00Z')
    expect(isAfterPosition(messages[2]!, at)).toBe(true)
    expect(isAfterPosition(messages[1]!, at)).toBe(false)
    expect(isAfterPosition(messages[0]!, at)).toBe(false)
  })
})

describe('readByLabel', () => {
  it('skriver navnene som en sætning', () => {
    expect(readByLabel(['Alice'])).toBe('Set af Alice')
    expect(readByLabel(['Alice', 'Bob'])).toBe('Set af Alice og Bob')
    expect(readByLabel(['Alice', 'Bob', 'Carl'])).toBe(
      'Set af Alice, Bob og Carl',
    )
  })
})

describe('upsertPosition', () => {
  it('erstatter medlemmets gamle position i samme rum', () => {
    const next = upsertPosition(
      [position('carl', 'm1', '2026-11-01T10:00:00Z')],
      position('carl', 'm2', '2026-11-01T10:01:00Z'),
    )
    expect(next).toEqual([position('carl', 'm2', '2026-11-01T10:01:00Z')])
  })
})
