import { describe, expect, it } from 'vitest'
import {
  addReaction,
  groupReactionsByMessage,
  reactionLabel,
  removeReaction,
  summarizeReactions,
  type Reaction,
} from './reactions'

const mine: Reaction = {
  message_id: 'message-1',
  user_id: 'me',
  emoji: '👍',
}
const hers: Reaction = {
  message_id: 'message-1',
  user_id: 'ada',
  emoji: '👍',
}
const elsewhere: Reaction = {
  message_id: 'message-2',
  user_id: 'ada',
  emoji: '❤️',
}

function nameFor(id: string) {
  return id === 'ada' ? 'Ada' : 'Bo'
}

describe('addReaction', () => {
  it('ignores the realtime echo of a reaction added optimistically', () => {
    const optimistic = addReaction([], mine)
    expect(addReaction(optimistic, { ...mine })).toEqual(optimistic)
  })

  it('keeps reactions from different members on the same emoji', () => {
    expect(addReaction([mine], hers)).toEqual([mine, hers])
  })
})

describe('removeReaction', () => {
  it('removes only the exact reaction', () => {
    expect(removeReaction([mine, hers, elsewhere], mine)).toEqual([
      hers,
      elsewhere,
    ])
  })

  it('is safe on an empty cache', () => {
    expect(removeReaction(undefined, mine)).toEqual([])
  })
})

describe('groupReactionsByMessage', () => {
  it('keeps each message’s reactions apart', () => {
    const grouped = groupReactionsByMessage([mine, hers, elsewhere])

    expect(grouped.get('message-1')).toEqual([mine, hers])
    expect(grouped.get('message-2')).toEqual([elsewhere])
    expect(grouped.get('message-3')).toBeUndefined()
  })

  it('is safe on an empty cache', () => {
    expect(groupReactionsByMessage(undefined).size).toBe(0)
  })
})

describe('summarizeReactions', () => {
  it('counts one emoji per message and marks the member’s own', () => {
    const summaries = summarizeReactions([mine, hers], 'me', nameFor)

    expect(summaries).toEqual([
      { emoji: '👍', count: 2, reactedByMe: true, names: ['Dig', 'Ada'] },
    ])
  })

  it('leaves out emoji nobody used', () => {
    const summaries = summarizeReactions([hers], 'me', nameFor)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].reactedByMe).toBe(false)
  })

  it('returns nothing for a message without reactions', () => {
    // Sådan ser et opslag ud, når grupperingen ikke har beskeden.
    expect(summarizeReactions(undefined, 'me', nameFor)).toEqual([])
    expect(summarizeReactions([], 'me', nameFor)).toEqual([])
  })
})

describe('reactionLabel', () => {
  it('says what a press will do', () => {
    expect(
      reactionLabel({
        emoji: '👍',
        count: 1,
        reactedByMe: true,
        names: ['Dig'],
      }),
    ).toBe('Fjern din 👍-reaktion. Dig')
    expect(
      reactionLabel({
        emoji: '❤️',
        count: 1,
        reactedByMe: false,
        names: ['Ada'],
      }),
    ).toBe('Reagér med ❤️. Ada')
  })
})
