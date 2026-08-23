import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  AccountDeletionError,
  accountDeletionErrorMessage,
  deleteAccount,
} from './deleteAccount'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  invoke: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    functions: { invoke: mocks.invoke },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInWithPassword.mockResolvedValue({ error: null })
  mocks.invoke.mockResolvedValue({ error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

describe('deleteAccount', () => {
  it('uses the password only for Auth and sends only confirmation to the function', async () => {
    await deleteAccount('medlem@example.com', 'hemmelig')

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'medlem@example.com',
      password: 'hemmelig',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('delete-account', {
      body: { confirmation: ACCOUNT_DELETION_CONFIRMATION },
    })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('does not call the function when password reauthentication fails', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error('Invalid login credentials'),
    })

    await expect(
      deleteAccount('medlem@example.com', 'forkert'),
    ).rejects.toMatchObject({ code: 'invalid_password' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('accountDeletionErrorMessage', () => {
  it('explains that storage failure leaves the account available for retry', () => {
    expect(
      accountDeletionErrorMessage(
        new AccountDeletionError('storage_cleanup_failed'),
      ),
    ).toContain('Kontoen er bevaret')
  })

  it('explains the last-admin invariant', () => {
    expect(
      accountDeletionErrorMessage(new AccountDeletionError('last_admin')),
    ).toContain('sidste administrator')
  })
})
