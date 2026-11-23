import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_TOKENS = {
  accessToken: 'jwt-access',
  refreshToken: 'refresh-tok',
  refreshTokenExpiresAt: 9999999,
  userId: 'user-1',
}

const mocks = vi.hoisted(() => ({
  email: 'medlem@naturklubben.dk',
  signInWithPassword: vi.fn(),
  signInWithPreviewMember: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
  convexQuery: vi.fn(),
  requestDeletion: vi.fn(),
  downloadAccountExport: vi.fn(),
  isPreviewDeployment: false,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({
    setSession: mocks.setSession,
    signOut: mocks.signOut,
  }),
}))

vi.mock('convex/react', () => ({
  useQuery: () => mocks.email,
  useConvex: () => ({ query: mocks.convexQuery }),
  useMutation: () => mocks.signInWithPassword,
  useAction: () => mocks.signInWithPreviewMember,
}))

vi.mock('./deleteAccount', async (importActual) => {
  const actual = await importActual<typeof import('./deleteAccount')>()
  return {
    ...actual,
    useDeleteAccount: () => ({
      isPending: false,
      requestDeletion: mocks.requestDeletion,
    }),
  }
})

vi.mock('./exportAccount', () => ({
  downloadAccountExport: (...args: unknown[]) =>
    mocks.downloadAccountExport(...args),
}))

vi.mock('../pwa/previewInstall', () => ({
  isPreviewDeployment: () => mocks.isPreviewDeployment,
}))

import { DeleteAccountSection } from './DeleteAccountSection'

beforeEach(() => {
  mocks.signInWithPassword.mockReset()
  mocks.signInWithPreviewMember.mockReset()
  mocks.setSession.mockReset()
  mocks.setSession.mockResolvedValue(undefined)
  mocks.signOut.mockReset()
  mocks.signOut.mockResolvedValue(undefined)
  mocks.navigate.mockReset()
  mocks.convexQuery.mockReset()
  mocks.convexQuery.mockResolvedValue({ exportedAt: '2026-01-01' })
  mocks.requestDeletion.mockReset()
  mocks.requestDeletion.mockResolvedValue(undefined)
  mocks.downloadAccountExport.mockReset()
  mocks.isPreviewDeployment = false
})

afterEach(cleanup)

describe('DeleteAccountSection preview-bekræftelse', () => {
  it('falder ikke tilbage til preview-member uden for preview', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'INVALID_CREDENTIALS' },
    })
    render(<DeleteAccountSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Hent mine data' }))
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'forkert-kode' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hent data som JSON' }))

    expect(await screen.findByText('Forkert adgangskode.')).toBeTruthy()
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(mocks.signInWithPreviewMember).not.toHaveBeenCalled()
    expect(mocks.convexQuery).not.toHaveBeenCalled()
    expect(mocks.downloadAccountExport).not.toHaveBeenCalled()
  })

  it('bekræfter dataeksport via preview-member på preview uden lokal prod-kode', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'USER_NOT_FOUND' },
    })
    mocks.signInWithPreviewMember.mockResolvedValueOnce({
      status: 'complete',
      tokens: MOCK_TOKENS,
    })
    render(<DeleteAccountSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Hent mine data' }))
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'prod-kode-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hent data som JSON' }))

    await vi.waitFor(() => {
      expect(mocks.downloadAccountExport).toHaveBeenCalledWith({
        exportedAt: '2026-01-01',
      })
    })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'medlem@naturklubben.dk',
      password: 'prod-kode-123',
    })
    expect(mocks.signInWithPreviewMember).toHaveBeenCalledWith({
      email: 'medlem@naturklubben.dk',
      password: 'prod-kode-123',
    })
  })

  it('bekræfter kontosletning via preview-member på preview ved ubekræftet lokal konto', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'USER_NOT_FOUND' },
    })
    mocks.signInWithPreviewMember.mockResolvedValueOnce({
      status: 'complete',
      tokens: MOCK_TOKENS,
    })
    render(<DeleteAccountSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Start kontosletning' }))
    fireEvent.change(screen.getByLabelText('Nuværende adgangskode'), {
      target: { value: 'prod-kode-123' },
    })
    fireEvent.change(
      screen.getByLabelText(/Skriv\s+SLET MIN KONTO\s+for at bekræfte/i),
      { target: { value: 'SLET MIN KONTO' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Slet min konto permanent' }),
    )

    await vi.waitFor(() => {
      expect(mocks.requestDeletion).toHaveBeenCalledWith('SLET MIN KONTO')
    })
    expect(mocks.signInWithPreviewMember).toHaveBeenCalledWith({
      email: 'medlem@naturklubben.dk',
      password: 'prod-kode-123',
    })
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/konto-slettet')
  })

  it('viser fejl og sletter ikke konto hvis preview-member afviser adgangskoden', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'USER_NOT_FOUND' },
    })
    mocks.signInWithPreviewMember.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'INVALID_CREDENTIALS' },
    })
    render(<DeleteAccountSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Start kontosletning' }))
    fireEvent.change(screen.getByLabelText('Nuværende adgangskode'), {
      target: { value: 'forkert-prod-kode' },
    })
    fireEvent.change(
      screen.getByLabelText(/Skriv\s+SLET MIN KONTO\s+for at bekræfte/i),
      { target: { value: 'SLET MIN KONTO' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Slet min konto permanent' }),
    )

    expect(await screen.findByText('Forkert adgangskode.')).toBeTruthy()
    expect(mocks.requestDeletion).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
