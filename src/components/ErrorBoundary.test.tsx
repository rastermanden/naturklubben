import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCachedAppAndReload } from '../lib/appRecovery'
import { reportClientError } from '../lib/errorReporting'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('../lib/errorReporting', () => ({
  reportClientError: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function BrokenPage(): React.ReactNode {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  it('isolates a route error and reports it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary variant="route" reportSource="react-route">
        <BrokenPage />
      </ErrorBoundary>,
    )

    expect(
      screen.getByRole('heading', {
        name: 'Noget gik galt på denne side',
      }),
    ).toBeTruthy()
    expect(screen.queryByText('Ryd cache og genstart')).toBeNull()
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failed' }),
      expect.objectContaining({ source: 'react-route' }),
    )

    consoleError.mockRestore()
  })

  it('surfaces a failed cache recovery', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const caches = window.caches
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockRejectedValue(new Error('cache unavailable')),
      },
    })

    render(
      <ErrorBoundary variant="app" reportSource="react-global">
        <BrokenPage />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('Ryd cache og genstart'))

    expect(
      await screen.findByText(
        'Cachen kunne ikke ryddes automatisk. Luk appen helt, og prøv igen.',
      ),
    ).toBeTruthy()

    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: caches,
    })
    consoleError.mockRestore()
  })
})

describe('clearCachedAppAndReload', () => {
  it('deletes caches, unregisters service workers, and reloads', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    const unregister = vi.fn().mockResolvedValue(true)
    const reload = vi.fn()

    await clearCachedAppAndReload({
      cacheStorage: {
        keys: vi
          .fn()
          .mockResolvedValue([
            'workbox-precache-http://localhost:3000/',
            'supabase-storage-images',
            'unrelated-app-cache',
          ]),
        delete: deleteCache,
      },
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([
          { scope: 'http://localhost:3000/', unregister },
          { scope: 'https://example.com/', unregister },
        ]),
      },
      reload,
    })

    expect(deleteCache).toHaveBeenCalledTimes(2)
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-app-cache')
    expect(unregister).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
  })
})
