import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_TOKENS = {
  accessToken: 'jwt-access',
  refreshToken: 'refresh-tok',
  refreshTokenExpiresAt: 9999999,
  userId: 'user-1',
}

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithPreviewMember: vi.fn(),
  setSession: vi.fn(),
  isPreviewDeployment: false,
}))

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ setSession: mocks.setSession }),
}))

vi.mock('convex/react', () => ({
  useMutation: () => mocks.signInWithPassword,
  useAction: () => mocks.signInWithPreviewMember,
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: string; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: () => null,
  useLocation: () => ({ state: null }),
}))

vi.mock('../features/pwa/previewInstall', () => ({
  isPreviewDeployment: () => mocks.isPreviewDeployment,
}))

import LoginPage from './LoginPage'

function submitCredentials(email: string, password: string) {
  render(<LoginPage />)
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText('Adgangskode'), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Log ind' }))
}

beforeEach(() => {
  mocks.signInWithPassword.mockReset()
  mocks.signInWithPreviewMember.mockReset()
  mocks.setSession.mockReset()
  mocks.setSession.mockResolvedValue(undefined)
  mocks.isPreviewDeployment = false
})

afterEach(cleanup)

describe('LoginPage preview-login', () => {
  it('kalder kun e-mail/adgangskode uden for preview', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'INVALID_CREDENTIALS' },
    })
    submitCredentials('medlem@example.com', 'forkert-kode')

    const alert = await screen.findByText('Forkert e-mail eller adgangskode.')
    expect(alert).toBeTruthy()
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'medlem@example.com',
      password: 'forkert-kode',
    })
    expect(mocks.signInWithPreviewMember).not.toHaveBeenCalled()
    expect(mocks.setSession).not.toHaveBeenCalled()
  })

  it('logger testbrugeren lokalt ind på preview uden at kalde preview-member', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'complete',
      tokens: MOCK_TOKENS,
    })
    submitCredentials('tester@example.com', 'test-kode-123')

    await vi.waitFor(() => {
      expect(mocks.setSession).toHaveBeenCalledWith(MOCK_TOKENS)
    })
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(mocks.signInWithPreviewMember).not.toHaveBeenCalled()
  })

  it('falder tilbage til preview-member på preview når lokalt login returnerer fejl', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'USER_NOT_FOUND' },
    })
    mocks.signInWithPreviewMember.mockResolvedValueOnce({
      status: 'complete',
      tokens: MOCK_TOKENS,
    })
    submitCredentials('medlem@naturklubben.dk', 'prod-adgangskode')

    await vi.waitFor(() => {
      expect(mocks.setSession).toHaveBeenCalledWith(MOCK_TOKENS)
    })
    expect(mocks.signInWithPreviewMember).toHaveBeenCalledWith({
      email: 'medlem@naturklubben.dk',
      password: 'prod-adgangskode',
    })
  })

  it('viser almindelig loginfejl ved afvist medlem eller forkert adgangskode', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'USER_NOT_FOUND' },
    })
    mocks.signInWithPreviewMember.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'INVALID_CREDENTIALS' },
    })
    submitCredentials('ukendt@example.com', 'forkert')

    const message = await screen.findByText('Forkert e-mail eller adgangskode.')
    expect(message).toBeTruthy()
    expect(message.getAttribute('data-code')).toBe('INVALID_CREDENTIALS')
    expect(mocks.setSession).not.toHaveBeenCalled()
  })

  it('viser rate-limit-besked når preview-member afviser pga. for mange forsøg', async () => {
    mocks.isPreviewDeployment = true
    mocks.signInWithPassword.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'USER_NOT_FOUND' },
    })
    mocks.signInWithPreviewMember.mockResolvedValueOnce({
      status: 'error',
      userError: { error: 'RATE_LIMITED' },
    })
    submitCredentials('medlem@example.com', 'forkert')

    const message = await screen.findByText(
      'Der er forsøgt for mange gange på kort tid. Prøv igen om lidt.',
    )
    expect(message).toBeTruthy()
  })
})
