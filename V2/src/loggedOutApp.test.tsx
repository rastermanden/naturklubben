import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from './features/theme/ThemeProvider'

const requestDelivery = vi.hoisted(() => vi.fn())
const queries = vi.hoisted(() => [] as { name: string; args: unknown }[])

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  useQuery: (query: unknown, args: unknown) => {
    queries.push({ name: getFunctionName(query as never), args })
    if (args === 'skip') return undefined
    return []
  },
  useMutation: () => requestDelivery,
}))

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
}))

import App from './App'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  queries.length = 0
  requestDelivery.mockClear()
})

function renderLoggedOut(path: string) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const uncaught: unknown[] = []
  const onError = (event: ErrorEvent) => {
    uncaught.push(event.error)
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    uncaught.push(event.reason)
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
    { container: root },
  )

  return { root, uncaught, consoleError }
}

describe('gæst', () => {
  it('holder forsiden oppe uden medlemskald', () => {
    const { root, uncaught, consoleError } = renderLoggedOut('/')

    expect(root.childElementCount).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Naturklubben' })).toBeTruthy()
    expect(uncaught).toEqual([])
    expect(requestDelivery).not.toHaveBeenCalled()
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes('Kunne ikke udsende nyheden'),
      ),
    ).toBe(false)

    const list = queries.find((query) => query.name === 'announcements:list')
    expect(list?.args).toBe('skip')
    const delivery = queries.find(
      (query) => query.name === 'announcements:requestDelivery',
    )
    expect(delivery).toBeUndefined()
  })

  it('viser aktiviteter og den offentlige kalender uden at hænge i indlæsning', () => {
    renderLoggedOut('/aktiviteter')
    expect(
      screen.getByRole('heading', { name: 'Ingen aktiviteter endnu' }),
    ).toBeTruthy()

    cleanup()
    queries.length = 0
    renderLoggedOut('/kalender/offentlig')
    expect(screen.queryByText('Henter begivenheder…')).toBeNull()
    expect(
      screen.getByText(
        'Der er ingen åbne begivenheder lige nu. Kig forbi igen senere.',
      ),
    ).toBeTruthy()
  })
})
