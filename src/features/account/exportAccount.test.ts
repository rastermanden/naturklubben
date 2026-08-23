import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountExportError,
  downloadAccountExport,
  exportAccount,
} from './exportAccount'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: { signInWithPassword: mocks.signInWithPassword },
    functions: { invoke: mocks.invoke },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInWithPassword.mockResolvedValue({ error: null })
  mocks.invoke.mockResolvedValue({ data: { version: 1 }, error: null })
})

describe('exportAccount', () => {
  it('reauthenticates before invoking the export function', async () => {
    await expect(
      exportAccount('medlem@example.com', 'hemmelig'),
    ).resolves.toEqual({ version: 1 })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'medlem@example.com',
      password: 'hemmelig',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('export-account', { body: {} })
  })

  it('does not invoke the function when reauthentication fails', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('invalid') })
    await expect(
      exportAccount('medlem@example.com', 'forkert'),
    ).rejects.toMatchObject({ code: 'invalid_password' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('downloadAccountExport', () => {
  it('downloads readable JSON with a dated filename', () => {
    vi.useFakeTimers()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:export')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)

    downloadAccountExport(
      { profile: { full_name: 'Åse' } },
      new Date('2026-08-23T12:00:00.000Z'),
    )

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'naturklubben-data-2026-08-23.json',
    )
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export')

    vi.useRealTimers()
  })

  it('exposes a stable export error type', () => {
    expect(new AccountExportError('export_failed')).toMatchObject({
      code: 'export_failed',
    })
  })
})
