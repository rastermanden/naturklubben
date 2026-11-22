import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  email: 'medlem@naturklubben.dk',
  signIn: vi.fn(),
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
    signIn: mocks.signIn,
    signOut: mocks.signOut,
  }),
}))

vi.mock('convex/react', () => ({
  useQuery: () => mocks.email,
  useConvex: () => ({ query: mocks.convexQuery }),
  useMutation: () => vi.fn(),
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
  mocks.signIn.mockReset()
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
    mocks.signIn.mockRejectedValueOnce(new ConvexError('INVALID_CREDENTIALS'))
    render(<DeleteAccountSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Hent mine data' }))
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'forkert-kode' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hent data som JSON' }))

    expect(await screen.findByText('Forkert adgangskode.')).toBeTruthy()
    expect(mocks.signIn).toHaveBeenCalledTimes(1)
    expect(mocks.convexQuery).not.toHaveBeenCalled()
    expect(mocks.downloadAccountExport).not.toHaveBeenCalled()
  })

  it('bekræfter dataeksport via preview-member på preview uden lokal prod-kode', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn
      .mockRejectedValueOnce(new Error('InvalidAccountId'))
      .mockResolvedValueOnce({ signingIn: true })
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
    expect(mocks.signIn).toHaveBeenNthCalledWith(1, 'password', {
      email: 'medlem@naturklubben.dk',
      password: 'prod-kode-123',
      flow: 'signIn',
    })
    expect(mocks.signIn).toHaveBeenNthCalledWith(2, 'preview-member', {
      email: 'medlem@naturklubben.dk',
      password: 'prod-kode-123',
    })
  })

  it('bekræfter kontosletning via preview-member på preview når password returnerer signingIn: false', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn
      .mockResolvedValueOnce({ signingIn: false })
      .mockResolvedValueOnce({ signingIn: true })
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
    expect(mocks.signIn).toHaveBeenNthCalledWith(2, 'preview-member', {
      email: 'medlem@naturklubben.dk',
      password: 'prod-kode-123',
    })
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/konto-slettet')
  })

  it('viser fejl og sletter ikke konto hvis preview-member afviser adgangskoden', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn
      .mockRejectedValueOnce(new Error('InvalidAccountId'))
      .mockRejectedValueOnce(new ConvexError('INVALID_CREDENTIALS'))
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
