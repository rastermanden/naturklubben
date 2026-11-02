import { describe, expect, it } from 'vitest'
import {
  isAfterPosition,
  readByLabel,
  readersByMessage,
  type ReadPosition,
} from './readReceipts'

const messages = [
  { id: 'm1', userId: 'alice', createdAt: 1_000 },
  { id: 'm2', userId: 'bob', createdAt: 2_000 },
  { id: 'm3', userId: 'alice', createdAt: 3_000 },
]

function position(
  userId: string,
  lastReadMessageId: string | null,
  lastReadAt: number,
): ReadPosition {
  return { userId, room: 'general', lastReadMessageId, lastReadAt }
}

describe('readersByMessage', () => {
  it('sætter hver læser under den seneste besked, de har læst', () => {
    const map = readersByMessage(
      messages,
      [
        position('carl', 'm2', 2_000),
        position('dina', 'm3', 3_000),
        position('erik', 'm3', 3_000),
      ],
      'me',
    )
    expect(map.get('m2')).toEqual(['carl'])
    expect(map.get('m3')).toEqual(['dina', 'erik'])
    expect(map.has('m1')).toBe(false)
  })

  it('viser ikke en selv', () => {
    const map = readersByMessage(messages, [position('me', 'm3', 3_000)], 'me')
    expect(map.size).toBe(0)
  })

  it('viser ikke afsenderen under sin egen besked', () => {
    const map = readersByMessage(
      messages,
      [position('alice', 'm3', 3_000)],
      'me',
    )
    expect(map.size).toBe(0)
  })

  it('placerer efter tidspunktet, når positionens besked ikke er indlæst', () => {
    const map = readersByMessage(
      messages,
      [position('carl', 'gone', 2_500)],
      'me',
    )
    expect(map.get('m2')).toEqual(['carl'])
  })

  it('viser ikke en position, der ligger før de indlæste beskeder', () => {
    const map = readersByMessage(messages, [position('carl', 'old', 100)], 'me')
    expect(map.size).toBe(0)
  })
})

describe('isAfterPosition', () => {
  it('er sand uden en position', () => {
    expect(isAfterPosition(messages[0]!, undefined)).toBe(true)
  })

  it('følger tidspunktet og ved lighed id', () => {
    const at = position('me', 'm2', 2_000)
    expect(isAfterPosition(messages[2]!, at)).toBe(true)
    expect(isAfterPosition(messages[1]!, at)).toBe(false)
    expect(isAfterPosition(messages[0]!, at)).toBe(false)
  })

  it('regner et millisekund uden besked-id som allerede læst', () => {
    const at = position('me', null, 2_000)
    expect(isAfterPosition(messages[1]!, at)).toBe(false)
    expect(isAfterPosition(messages[2]!, at)).toBe(true)
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
