import { describe, expect, it } from 'vitest'
import { guestReplyDraft, guestReplyMailto } from './guestReplyMailto'

const event = {
  title: 'Åben skovtur',
  location: 'Dyrehaven',
  start_at: '2030-09-10T09:00:00.000Z',
  end_at: '2030-09-10T11:00:00.000Z',
}

describe('guestReplyDraft', () => {
  it('welcomes an approved guest with title, time and place', () => {
    const draft = guestReplyDraft({
      status: 'approved',
      fullName: 'Gitte Gæst',
      email: 'gitte@example.com',
      event,
    })

    expect(draft.subject).toBe('Du er velkommen til "Åben skovtur"')
    expect(draft.body).toContain('Hej Gitte')
    expect(draft.body).toContain('Åben skovtur')
    expect(draft.body).toContain('Sted: Dyrehaven')
  })

  it('uses the neutral rejection wording', () => {
    const draft = guestReplyDraft({
      status: 'rejected',
      fullName: 'Gitte Gæst',
      email: 'gitte@example.com',
      event,
    })

    expect(draft.body).toContain(
      'Vi kan desværre ikke tage imod din ansøgning denne gang.',
    )
  })

  it('omits the "Sted" line when there is no location', () => {
    const draft = guestReplyDraft({
      status: 'approved',
      fullName: 'Gitte Gæst',
      email: 'gitte@example.com',
      event: { ...event, location: null },
    })

    expect(draft.body).not.toContain('Sted:')
  })
})

describe('guestReplyMailto', () => {
  it('builds a mailto: link with the guest e-mail, subject and body', () => {
    const href = guestReplyMailto({
      status: 'approved',
      fullName: 'Gitte Gæst',
      email: 'gitte@example.com',
      event,
    })

    expect(href.startsWith('mailto:gitte%40example.com?')).toBe(true)
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('subject=Du er velkommen til "Åben skovtur"')
    expect(decoded).toContain('Hej Gitte')
  })
})
