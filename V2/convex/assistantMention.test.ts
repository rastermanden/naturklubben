import { describe, expect, it } from 'vitest'
import {
  assistantMentionEmail,
  assistantMentionMail,
  assistantProfileEmail,
  mentionsAssistantText,
  messageMentionsAssistant,
} from './assistantMention'

const author = 'member-1'
const bot = 'bot-1'

describe('mentionsAssistantText', () => {
  it.each([
    'Grok',
    'grok',
    'GROK',
    'Hej Grok!',
    '(Grok)',
    '@Grok',
    '@grok',
    'Grok Bot',
    'grok   bot',
  ])('rammer %s', (content) => {
    expect(mentionsAssistantText(content)).toBe(true)
  })

  it.each(['grokking', 'GrokBot', 'agrok', 'hej', 'Kasper'])(
    'rammer ikke %s',
    (content) => {
      expect(mentionsAssistantText(content)).toBe(false)
    },
  )
})

describe('messageMentionsAssistant', () => {
  it('rammer et gemt mention-id uden navnet i teksten', () => {
    expect(
      messageMentionsAssistant({
        content: 'kan du se det her',
        mentionIds: [bot],
        assistantProfileId: bot,
        authorProfileId: author,
      }),
    ).toBe(true)
  })

  it('springer assistentens egne beskeder over', () => {
    expect(
      messageMentionsAssistant({
        content: 'Jeg er Grok Bot',
        mentionIds: [bot],
        assistantProfileId: bot,
        authorProfileId: bot,
      }),
    ).toBe(false)
  })

  it('sender ikke til andre, bare fordi nogen er nævnt', () => {
    expect(
      messageMentionsAssistant({
        content: 'hej Kasper',
        mentionIds: ['kasper'],
        assistantProfileId: bot,
        authorProfileId: author,
      }),
    ).toBe(false)
  })
})

describe('assistantMentionMail', () => {
  it('bruger kun den konfigurerede adresse', () => {
    expect(assistantProfileEmail()).toBe('naturklubben-test@agentmail.to')
    expect(assistantMentionEmail(undefined)).toBe(
      'naturklubben-test@agentmail.to',
    )
    expect(assistantMentionEmail('  Andre@example.com ')).toBe(
      'andre@example.com',
    )
    expect(assistantMentionEmail('ikke en mail')).toBe(
      'naturklubben-test@agentmail.to',
    )
  })

  it('har rum, afsender, tid, tekst og link', () => {
    const mail = assistantMentionMail({
      room: 'admin',
      authorName: 'Martin',
      createdAt: Date.UTC(2026, 10, 3, 4, 42),
      content: 'Hej Grok\nkan du se det?',
      siteUrl: 'https://naturklubben.dk/',
    })
    expect(mail.subject).toBe('Omtale i Admin-chat')
    expect(mail.text).toContain('Martin')
    expect(mail.text).toContain('Admin-chat')
    expect(mail.text).toContain('Hej Grok\nkan du se det?')
    expect(mail.text).toContain('https://naturklubben.dk/admin/chat')
    expect(mail.html).toContain('https://naturklubben.dk/admin/chat')
    expect(mail.text).toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })
})
