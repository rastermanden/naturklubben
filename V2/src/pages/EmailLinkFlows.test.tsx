import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ConvexReactClient } from 'convex/react'
import { getFunctionName } from 'convex/server'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import ForgotPasswordPage from './ForgotPasswordPage'
import ResetPasswordPage from './ResetPasswordPage'
import SignupPage from './SignupPage'
import WelcomePage from './WelcomePage'

const DEPLOYMENT_URL = 'https://integration-test.convex.cloud'
const EXPECTED_NAMESPACE = 'httpsintegrationtestconvexcloud'

const MOCK_TOKENS = {
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh-tok-1',
  refreshTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  userId: 'user-123',
}

type HandlerMap = {
  queries?: Record<string, (args: Record<string, unknown>) => unknown>
  mutations?: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown> | unknown
  >
}

function createFakeConvexClient(handlers: HandlerMap): {
  client: ConvexReactClient
  calls: Array<{ name: string; args: Record<string, unknown> }>
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = new ConvexReactClient(DEPLOYMENT_URL, {
    logger: false,
    unsavedChangesWarning: false,
  })
  const watchListeners = new Set<() => void>()

  const anyClient = client as unknown as {
    setAuth: (
      fetchToken: (args: {
        forceRefreshToken: boolean
      }) => Promise<string | null>,
      onChange: (isAuthenticated: boolean) => void,
    ) => void
    clearAuth: () => void
    mutation: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
    watchQuery: (
      query: unknown,
      args?: Record<string, unknown>,
    ) => {
      onUpdate: (cb: () => void) => () => void
      localQueryResult: () => unknown
      journal: () => undefined
    }
  }

  anyClient.setAuth = (fetchToken, onChange) => {
    void fetchToken({ forceRefreshToken: false }).then((token) => {
      onChange(token !== null)
      for (const listener of watchListeners) listener()
    })
  }
  anyClient.clearAuth = () => {
    for (const listener of watchListeners) listener()
  }
  anyClient.mutation = async (fn, args = {}) => {
    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0])
    calls.push({ name, args })
    const handler = handlers.mutations?.[name]
    if (!handler) {
      throw new Error(`Unexpected mutation in test: ${name}`)
    }
    const res = await handler(args)
    for (const listener of watchListeners) listener()
    return res
  }
  anyClient.watchQuery = (query, args = {}) => {
    const name = getFunctionName(query as Parameters<typeof getFunctionName>[0])
    return {
      onUpdate: (cb) => {
        watchListeners.add(cb)
        return () => {
          watchListeners.delete(cb)
        }
      },
      localQueryResult: () => {
        calls.push({ name, args })
        const handler = handlers.queries?.[name]
        return handler ? handler(args) : undefined
      },
      journal: () => undefined,
    }
  }

  return { client, calls }
}

describe('Email-link auth flows med ægte ConvexAuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('deler namespaced browserSecret mellem SignupPage og WelcomePage (?code=) og sender fullName med til claimProfile', async () => {
    let claimedProfile: { _id: string; fullName?: string } | null = null
    const { client, calls } = createFakeConvexClient({
      queries: {
        'auth:isAuthenticated': () => true,
        'members:me': () => claimedProfile,
      },
      mutations: {
        'auth:signUpWithEmailPassword': () => ({
          success: true,
          browserSecret: 'signup-secret-xyz',
        }),
        'auth:completeSignUpWithEmailPassword': () => ({
          status: 'complete',
          tokens: MOCK_TOKENS,
        }),
        'members:claimProfile': (args) => {
          claimedProfile = {
            _id: 'profile-1',
            fullName:
              typeof args.fullName === 'string' ? args.fullName : undefined,
          }
          return claimedProfile
        },
      },
    })

    const firstRender = render(
      <ConvexAuthProvider client={client} api={api.auth} ambientSignIns={[]}>
        <MemoryRouter initialEntries={['/opret']}>
          <SignupPage />
        </MemoryRouter>
      </ConvexAuthProvider>,
    )

    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Nyt Medlem' },
    })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'ny@naturklubben.dk' },
    })
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'sikker-kode-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Opret bruger' }))

    await screen.findByText('Tjek din e-mail')

    expect(
      window.localStorage.getItem('__convexAuthEmailPasswordSignUpSecret'),
    ).toBeNull()
    expect(
      window.localStorage.getItem(
        `__convexAuthEmailPasswordSignUpSecret_${EXPECTED_NAMESPACE}`,
      ),
    ).toBe('signup-secret-xyz')

    firstRender.unmount()

    window.history.pushState({}, '', '/velkommen?code=signup-code-123')
    render(
      <ConvexAuthProvider client={client} api={api.auth} ambientSignIns={[]}>
        <MemoryRouter initialEntries={['/velkommen?code=signup-code-123']}>
          <WelcomePage />
        </MemoryRouter>
      </ConvexAuthProvider>,
    )

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.name === 'auth:completeSignUpWithEmailPassword' &&
            c.args.emailCode === 'signup-code-123' &&
            c.args.browserSecret === 'signup-secret-xyz',
        ),
      ).toBe(true)
    })

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.name === 'members:claimProfile' &&
            c.args.fullName === 'Nyt Medlem',
        ),
      ).toBe(true)
    })
  })

  it('deler namespaced browserSecret mellem ForgotPasswordPage og ResetPasswordPage (?code=)', async () => {
    const { client, calls } = createFakeConvexClient({
      queries: {
        'auth:isAuthenticated': () => false,
        'auth:checkPasswordRecovery': (args) =>
          args.emailCode === 'reset-code-456' &&
          args.browserSecret === 'recovery-secret-abc'
            ? { success: true }
            : { success: false, userError: { error: 'INVALID_CHALLENGE' } },
      },
      mutations: {
        'auth:startPasswordRecovery': () => ({
          success: true,
          browserSecret: 'recovery-secret-abc',
          sentTo: 'medlem@naturklubben.dk',
        }),
        'auth:completePasswordRecovery': () => ({
          status: 'complete',
          tokens: MOCK_TOKENS,
        }),
      },
    })

    const firstRender = render(
      <ConvexAuthProvider client={client} api={api.auth} ambientSignIns={[]}>
        <MemoryRouter initialEntries={['/glemt-adgangskode']}>
          <ForgotPasswordPage />
        </MemoryRouter>
      </ConvexAuthProvider>,
    )

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'medlem@naturklubben.dk' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Send nulstillingslink' }),
    )

    await screen.findByText('Tjek din e-mail')

    expect(
      window.localStorage.getItem('__convexAuthEmailPasswordRecoverySecret'),
    ).toBeNull()
    expect(
      window.localStorage.getItem(
        `__convexAuthEmailPasswordRecoverySecret_${EXPECTED_NAMESPACE}`,
      ),
    ).toBe('recovery-secret-abc')

    firstRender.unmount()

    window.history.pushState({}, '', '/ny-adgangskode?code=reset-code-456')
    render(
      <ConvexAuthProvider client={client} api={api.auth} ambientSignIns={[]}>
        <MemoryRouter initialEntries={['/ny-adgangskode?code=reset-code-456']}>
          <Routes>
            <Route path="/ny-adgangskode" element={<ResetPasswordPage />} />
            <Route path="/" element={<p>Forside</p>} />
          </Routes>
        </MemoryRouter>
      </ConvexAuthProvider>,
    )

    await screen.findByText('Vælg en ny adgangskode')

    fireEvent.change(screen.getByLabelText('Ny adgangskode'), {
      target: { value: 'ny-sikker-kode-2026' },
    })
    fireEvent.change(screen.getByLabelText('Gentag adgangskoden'), {
      target: { value: 'ny-sikker-kode-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gem adgangskode' }))

    await screen.findByText('Forside')

    expect(
      calls.some(
        (c) =>
          c.name === 'auth:completePasswordRecovery' &&
          c.args.emailCode === 'reset-code-456' &&
          c.args.browserSecret === 'recovery-secret-abc' &&
          c.args.newPassword === 'ny-sikker-kode-2026',
      ),
    ).toBe(true)
  })
})
