import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  rehashIfImported: vi.fn(),
  isPreviewDeployment: false,
}))

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: mocks.signIn }),
}))

vi.mock('convex/react', () => ({
  useAction: () => mocks.rehashIfImported,
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
  mocks.signIn.mockReset()
  mocks.rehashIfImported.mockReset()
  mocks.rehashIfImported.mockResolvedValue(null)
  mocks.isPreviewDeployment = false
})

afterEach(cleanup)

describe('LoginPage preview-login', () => {
  it('kalder kun password-provideren uden for preview', async () => {
    mocks.signIn.mockRejectedValueOnce(new ConvexError('INVALID_CREDENTIALS'))
    submitCredentials('medlem@example.com', 'forkert-kode')

    const alert = await screen.findByText('Forkert e-mail eller adgangskode.')
    expect(alert).toBeTruthy()
    expect(mocks.signIn).toHaveBeenCalledTimes(1)
    expect(mocks.signIn).toHaveBeenCalledWith('password', {
      email: 'medlem@example.com',
      password: 'forkert-kode',
      flow: 'signIn',
      redirectTo: expect.stringContaining('velkommen'),
    })
  })

  it('logger testbrugeren lokalt ind på preview uden at kalde preview-member', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn.mockResolvedValueOnce({ signingIn: true })
    submitCredentials('tester@example.com', 'test-kode-123')

    await vi.waitFor(() => {
      expect(mocks.rehashIfImported).toHaveBeenCalledWith({
        password: 'test-kode-123',
      })
    })
    expect(mocks.signIn).toHaveBeenCalledTimes(1)
    expect(mocks.signIn).toHaveBeenCalledWith(
      'password',
      expect.objectContaining({
        email: 'tester@example.com',
        flow: 'signIn',
      }),
    )
  })

  it('falder tilbage til preview-member på preview og springer rehash over', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn
      .mockRejectedValueOnce(new Error('InvalidAccountId'))
      .mockResolvedValueOnce({ signingIn: true })
    submitCredentials('medlem@naturklubben.dk', 'prod-adgangskode')

    await vi.waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledTimes(2)
    })
    expect(mocks.signIn).toHaveBeenNthCalledWith(2, 'preview-member', {
      email: 'medlem@naturklubben.dk',
      password: 'prod-adgangskode',
    })
    expect(mocks.rehashIfImported).not.toHaveBeenCalled()
  })

  it('viser almindelig loginfejl ved afvist medlem eller forkert adgangskode', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn
      .mockRejectedValueOnce(new Error('InvalidAccountId'))
      .mockRejectedValueOnce(new ConvexError('INVALID_CREDENTIALS'))
    submitCredentials('ukendt@example.com', 'forkert')

    const message = await screen.findByText('Forkert e-mail eller adgangskode.')
    expect(message).toBeTruthy()
    expect(message.getAttribute('data-code')).toBe('INVALID_CREDENTIALS')
    expect(mocks.rehashIfImported).not.toHaveBeenCalled()
  })

  it('viser rate-limit-besked når preview-member afviser pga. for mange forsøg', async () => {
    mocks.isPreviewDeployment = true
    mocks.signIn
      .mockRejectedValueOnce(new Error('InvalidAccountId'))
      .mockRejectedValueOnce(new ConvexError('RATE_LIMITED'))
    submitCredentials('medlem@example.com', 'forkert')

    const message = await screen.findByText(
      'Der er forsøgt for mange gange på kort tid. Prøv igen om lidt.',
    )
    expect(message).toBeTruthy()
  })
})
