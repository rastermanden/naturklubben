import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { routeMetadata, type RouteMetadata } from '../routeMetadata'
import { RouteNavigation } from './RouteNavigation'

const testRoutes = [
  {
    path: '/',
    documentTitle: 'Naturklubben',
    announcement: 'Forside indlæst',
  },
  {
    path: '/kalender',
    documentTitle: 'Kalender | Naturklubben',
    announcement: 'Kalender indlæst',
  },
  {
    path: '/privat',
    documentTitle: 'Privat | Naturklubben',
    announcement: 'Privat side indlæst',
  },
] satisfies readonly RouteMetadata[]

function HomePage() {
  const navigate = useNavigate()

  return (
    <main>
      <h1>Forside</h1>
      <button type="button" onClick={() => navigate('/kalender')}>
        Åbn kalender
      </button>
    </main>
  )
}

function CalendarPage() {
  const navigate = useNavigate()

  return (
    <main>
      <h1>Kalender</h1>
      <button type="button" onClick={() => navigate(-1)}>
        Gå tilbage
      </button>
      <button
        type="button"
        onClick={() => navigate('/kalender?vis=mine#main-content')}
      >
        Opdater visning
      </button>
    </main>
  )
}

interface TestAppProps {
  initialEntry?: string
  persistentDialog?: boolean
  redirectPrivateRoute?: boolean
}

function TestApp({
  initialEntry = '/',
  persistentDialog = false,
  redirectPrivateRoute = false,
}: TestAppProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteNavigation routes={testRoutes} />
      {persistentDialog && <PersistentDialog />}
      <div id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/kalender" element={<CalendarPage />} />
          <Route
            path="/privat"
            element={
              redirectPrivateRoute ? (
                <Navigate to="/" replace />
              ) : (
                <main>
                  <h1>Privat side</h1>
                </main>
              )
            }
          />
        </Routes>
      </div>
    </MemoryRouter>
  )
}

function PersistentDialog() {
  const navigate = useNavigate()

  return (
    <div role="dialog" aria-modal="true" aria-label="Vedvarende dialog">
      <button type="button" onClick={() => navigate('/kalender')}>
        Gå til kalender
      </button>
    </div>
  )
}

function finishNavigation() {
  act(() => vi.runAllTimers())
}

beforeEach(() => {
  vi.useFakeTimers()
  document.title = 'Tidligere titel'
})

afterEach(() => {
  cleanup()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('RouteNavigation', () => {
  it('sets the initial title without announcing or moving focus twice in StrictMode', () => {
    render(
      <StrictMode>
        <TestApp initialEntry="/kalender" />
      </StrictMode>,
    )

    finishNavigation()

    expect(document.title).toBe('Kalender | Naturklubben')
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('heading', { name: 'Kalender' })).not.toBe(
      document.activeElement,
    )
  })

  it('announces and focuses the page heading on forward and back navigation', () => {
    render(<TestApp />)

    fireEvent.click(screen.getByRole('button', { name: 'Åbn kalender' }))
    finishNavigation()

    const calendarHeading = screen.getByRole('heading', { name: 'Kalender' })
    expect(document.title).toBe('Kalender | Naturklubben')
    expect(screen.getByRole('status').textContent).toBe('Kalender indlæst')
    expect(calendarHeading).toBe(document.activeElement)
    expect(calendarHeading.tabIndex).toBe(-1)

    fireEvent.click(screen.getByRole('button', { name: 'Gå tilbage' }))
    finishNavigation()

    expect(document.title).toBe('Naturklubben')
    expect(screen.getByRole('status').textContent).toBe('Forside indlæst')
    expect(screen.getByRole('heading', { name: 'Forside' })).toBe(
      document.activeElement,
    )
  })

  it('does not reset focus for search or hash changes on the current route', () => {
    render(<TestApp initialEntry="/kalender" />)
    const updateButton = screen.getByRole('button', { name: 'Opdater visning' })
    updateButton.focus()

    fireEvent.click(updateButton)
    finishNavigation()

    expect(screen.getByRole('status').textContent).toBe('')
    expect(updateButton).toBe(document.activeElement)
  })

  it('announces an auth-style redirect from an initial protected deep link', () => {
    render(<TestApp initialEntry="/privat" redirectPrivateRoute />)
    finishNavigation()

    expect(document.title).toBe('Naturklubben')
    expect(screen.getByRole('status').textContent).toBe('Forside indlæst')
    expect(screen.getByRole('heading', { name: 'Forside' })).toBe(
      document.activeElement,
    )
  })

  it('leaves focus inside an open modal dialog during route changes', () => {
    render(<TestApp persistentDialog />)
    const dialogNavigation = screen.getByRole('button', {
      name: 'Gå til kalender',
    })
    dialogNavigation.focus()

    fireEvent.click(dialogNavigation)
    finishNavigation()

    expect(document.title).toBe('Kalender | Naturklubben')
    expect(screen.getByRole('status').textContent).toBe('Kalender indlæst')
    expect(dialogNavigation).toBe(document.activeElement)
  })

  it.each(routeMetadata)(
    'sets the configured title for $path',
    ({ path, documentTitle }) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <RouteNavigation routes={routeMetadata} />
        </MemoryRouter>,
      )

      expect(document.title).toBe(documentTitle)
      expect(screen.getByRole('status').textContent).toBe('')
    },
  )
})
