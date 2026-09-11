import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRONOUNS_UNDISCLOSED } from './pronouns'
import {
  announcePronouns,
  pronounsAnnouncement,
  shouldAnnouncePronouns,
} from './announcePronouns'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMocks }))

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
  const insert = vi.fn()
  const single = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    single.mockResolvedValue({ data: { id: 'message-1' }, error: null })
    insert.mockReturnValue({ select: () => ({ single }) })
    supabaseMocks.from.mockReturnValue({ insert })
    supabaseMocks.functions.invoke.mockResolvedValue({ error: null })
  })

  it('lægger en handlingsbesked i chatten og beder om push', async () => {
    await announcePronouns('member-id', 'hen/hen')

    expect(supabaseMocks.from).toHaveBeenCalledWith('messages')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'member-id',
      content: pronounsAnnouncement('hen/hen'),
      message_type: 'action',
    })
    expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith('chat-push', {
      body: { messageId: 'message-1' },
    })
  })

  it('beder ikke om push, når beskeden ikke kunne gemmes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    single.mockResolvedValue({ data: null, error: new Error('nej') })

    await announcePronouns('member-id', 'hen/hen')

    expect(supabaseMocks.functions.invoke).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
