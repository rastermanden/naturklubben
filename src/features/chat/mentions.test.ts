import { describe, expect, it } from 'vitest'
import {
  applyMention,
  matchMentionCandidates,
  matchMentionQuery,
  mentionMembers,
  resolveMentions,
  splitMentions,
} from './mentions'
import type { MentionMember } from './mentions'

const members: MentionMember[] = [
  { id: 'martin', name: 'Martin Jensen' },
  { id: 'maren', name: 'Maren Sørensen' },
  { id: 'bo', name: 'Bo' },
  { id: 'bosse', name: 'Bosse Ågård' },
]

describe('mentionMembers', () => {
  it('sorts members by name and leaves out the reader and the nameless', () => {
    const list = mentionMembers(
      {
        zaza: { full_name: 'Åse', avatar_url: null, chat_color: null },
        anna: { full_name: 'Anna', avatar_url: null, chat_color: null },
        ghost: { full_name: null, avatar_url: null, chat_color: null },
        me: { full_name: 'Mig', avatar_url: null, chat_color: null },
      },
      'me',
    )

    expect(list).toEqual([
      { id: 'anna', name: 'Anna' },
      { id: 'zaza', name: 'Åse' },
    ])
  })
})

describe('matchMentionQuery', () => {
  it('finds the mention being typed at the caret', () => {
    expect(matchMentionQuery('Hej @mar', 8)).toEqual({
      start: 4,
      end: 8,
      query: 'mar',
    })
  })

  it('keeps matching across a space so full names can be typed', () => {
    expect(matchMentionQuery('Hej @Martin Je', 14)?.query).toBe('Martin Je')
  })

  it('gives up once the text after the @ is a sentence', () => {
    expect(matchMentionQuery('Hej @Martin Jensen kommer du med', 32)).toBeNull()
  })

  it('ignores an @ inside a word, so mail addresses are just text', () => {
    expect(matchMentionQuery('skriv til bo@example.com', 24)).toBeNull()
  })

  it('ignores an @ after the caret', () => {
    expect(matchMentionQuery('Hej @Bo og @Ma', 8)).toEqual({
      start: 4,
      end: 8,
      query: 'Bo ',
    })
  })
})

describe('matchMentionCandidates', () => {
  it('matches case-insensitively on any part of the name', () => {
    expect(matchMentionCandidates(members, 'sør').map((m) => m.id)).toEqual([
      'maren',
    ])
  })

  it('matches Danish letters as typed', () => {
    expect(matchMentionCandidates(members, 'ågå').map((m) => m.id)).toEqual([
      'bosse',
    ])
  })

  it('offers everyone before anything is typed', () => {
    expect(matchMentionCandidates(members, '')).toHaveLength(4)
  })
})

describe('applyMention', () => {
  it('replaces what was typed after the @ and keeps the rest of the text', () => {
    const query = matchMentionQuery('Hej @mar, kommer du?', 8)!

    expect(applyMention('Hej @mar, kommer du?', query, members[0])).toEqual({
      text: 'Hej @Martin Jensen , kommer du?',
      caret: 19,
    })
  })
})

describe('resolveMentions', () => {
  it('resolves a name typed by hand without picking from the list', () => {
    expect(resolveMentions('Hej @Bo, kommer du?', members)).toEqual(['bo'])
  })

  it('prefers the longest matching name', () => {
    expect(resolveMentions('Hej @Bosse Ågård', members)).toEqual(['bosse'])
  })

  it('does not match a name inside a longer word', () => {
    expect(resolveMentions('Hej @Bosseman', members)).toEqual([])
  })

  it('ignores an @ that is part of a mail address', () => {
    expect(resolveMentions('skriv til test@Bo.dk', members)).toEqual([])
  })

  it('mentions each member once, however often the name is written', () => {
    expect(resolveMentions('@Bo @Bo @Martin Jensen', members)).toEqual([
      'bo',
      'martin',
    ])
  })

  it('lets the picked member win when two members share a name', () => {
    const twins: MentionMember[] = [
      { id: 'first', name: 'Anne Marie' },
      { id: 'second', name: 'Anne Marie' },
    ]

    expect(resolveMentions('@Anne Marie', twins, ['second'])).toEqual([
      'second',
    ])
  })

  it('is empty for a message without mentions', () => {
    expect(resolveMentions('Vi ses ved søen', members)).toEqual([])
  })
})

describe('splitMentions', () => {
  it('marks only the names the message was actually sent with', () => {
    expect(splitMentions('Hej @Bo og @Martin Jensen', ['bo'], members)).toEqual(
      [
        { text: 'Hej ', mentionedId: null },
        { text: '@Bo', mentionedId: 'bo' },
        { text: ' og @Martin Jensen', mentionedId: null },
      ],
    )
  })

  it('leaves the text alone when the mentioned member has been renamed', () => {
    expect(splitMentions('Hej @Martin J', ['martin'], members)).toEqual([
      { text: 'Hej @Martin J', mentionedId: null },
    ])
  })

  it('leaves a deleted message with no content alone', () => {
    expect(splitMentions('', ['bo'], members)).toEqual([
      { text: '', mentionedId: null },
    ])
  })

  it('leaves the text alone when the mentioned member has no profile', () => {
    expect(splitMentions('Hej @Bo', ['ukendt'], members)).toEqual([
      { text: 'Hej @Bo', mentionedId: null },
    ])
  })
})
