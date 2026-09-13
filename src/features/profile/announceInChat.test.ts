import { beforeEach, describe, expect, it, vi } from 'vitest'
import { announceInChat } from './announceInChat'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMocks }))

describe('announceInChat', () => {
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
    await expect(
      announceInChat('member-id', 'har sat 🇺🇦 ved sit navn'),
    ).resolves.toBe(true)

    expect(supabaseMocks.from).toHaveBeenCalledWith('messages')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'member-id',
      content: 'har sat 🇺🇦 ved sit navn',
      message_type: 'action',
      mentions: [],
    })
    expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith('chat-push', {
      body: { messageId: 'message-1' },
    })
  })

  it('kan sende beskeden som almindelig tekst', async () => {
    await announceInChat('member-id', 'Der blev en plads ledig.', [], 'text')

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ message_type: 'text' }),
    )
  })

  it('sender de nævnte med, så de fremhæves og får push', async () => {
    await announceInChat('member-id', 'noget til @Bo', ['bo-id'])

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: ['bo-id'] }),
    )
  })

  it('beder ikke om push, når beskeden ikke kunne gemmes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    single.mockResolvedValue({ data: null, error: new Error('nej') })

    await expect(announceInChat('member-id', 'noget')).resolves.toBe(false)

    expect(supabaseMocks.functions.invoke).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('regner beskeden som sendt, selv om push slog fejl', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabaseMocks.functions.invoke.mockResolvedValue({
      error: new Error('nej'),
    })

    await expect(announceInChat('member-id', 'noget')).resolves.toBe(true)

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
