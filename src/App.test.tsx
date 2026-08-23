import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Outlet } from 'react-router-dom'
import { AuthContext } from './features/auth/AuthContext'
import App from './App'

const activityPageModule = vi.hoisted(() => {
  let resolve:
    ((module: { default: () => React.ReactNode }) => void) | undefined
  const promise = new Promise<{ default: () => React.ReactNode }>(
    (resolveModule) => {
      resolve = resolveModule
    },
  )

  return {
    load: vi.fn(() => promise),
    resolve(module: { default: () => React.ReactNode }) {
      resolve?.(module)
    },
  }
})

const chatPageModule = vi.hoisted(() => ({
  load: vi.fn(() =>
    Promise.resolve({
      default: () => <h1>Chat</h1>,
    }),
  ),
}))

vi.mock('./pages/ActivitiesPage', () => activityPageModule.load())
vi.mock('./pages/ChatPage', () => chatPageModule.load())
vi.mock('./pages/HeroPage', () => ({
  default: () => <h1>Naturklubben</h1>,
}))
vi.mock('./components/Layout', () => ({
  Layout: () => <Outlet />,
}))
vi.mock('./features/admin/AdminRoute', () => ({
  AdminRoute: ({ children }: { children: React.ReactNode }) => children,
}))

const authenticatedSession = {
  user: { id: 'member-id' },
} as Session

afterEach(cleanup)

function renderApp(path: string, session: Session | null = null) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider
        value={{ session, loading: false, signOut: () => Promise.resolve() }}
      >
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('App route loading', () => {
  it('shows an accessible fallback while a route chunk loads', async () => {
    renderApp('/aktiviteter')

    expect(screen.getByRole('status').textContent).toBe('Indlæser siden…')

    activityPageModule.resolve({
      default: () => <h1>Aktiviteter</h1>,
    })

    expect(
      await screen.findByRole('heading', { name: 'Aktiviteter' }),
    ).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not request a protected route chunk before authentication', async () => {
    renderApp('/chat')

    expect(
      await screen.findByRole('heading', { name: 'Naturklubben' }),
    ).toBeTruthy()
    await waitFor(() => expect(chatPageModule.load).not.toHaveBeenCalled())
  })

  it('loads a protected route chunk for an authenticated member', async () => {
    renderApp('/chat', authenticatedSession)

    expect(await screen.findByRole('heading', { name: 'Chat' })).toBeTruthy()
    expect(chatPageModule.load).toHaveBeenCalledOnce()
  })
})
