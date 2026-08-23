import { cleanup, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

const authenticatedSession: Session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'member-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    email: 'medlem@example.com',
    created_at: '2026-08-23T10:00:00.000Z',
  },
}

afterEach(cleanup)

function LandingPage() {
  const location = useLocation()

  return (
    <>
      <h1>Forside</h1>
      <output data-testid="navigation-state">
        {JSON.stringify(location.state)}
      </output>
    </>
  )
}

function renderProtectedRoute({
  session,
  loading,
}: Pick<AuthContextValue, 'session' | 'loading'>) {
  return render(
    <MemoryRouter initialEntries={['/kalender']}>
      <AuthContext.Provider
        value={{ session, loading, signOut: () => Promise.resolve() }}
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/kalender"
            element={
              <ProtectedRoute>
                <h1>Kalender</h1>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('sends unauthenticated visitors to the front page with their origin', () => {
    renderProtectedRoute({ session: null, loading: false })

    expect(screen.getByRole('heading').textContent).toBe('Forside')
    expect(screen.getByTestId('navigation-state').textContent).toBe(
      JSON.stringify({ authRequired: true, from: '/kalender' }),
    )
  })

  it('renders the protected page for an authenticated member', () => {
    renderProtectedRoute({
      session: authenticatedSession,
      loading: false,
    })

    expect(screen.getByRole('heading').textContent).toBe('Kalender')
  })

  it('renders neither page while the session is loading', () => {
    const { container } = renderProtectedRoute({
      session: null,
      loading: true,
    })

    expect(container.innerHTML).toBe('')
  })
})
