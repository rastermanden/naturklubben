import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/convexClient', () => ({ convex: {} }))
vi.mock('convex/react', () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}))
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
}))

import { appRoutes } from '../routes'
import { spaIndexFile, spaIndexPaths } from './spaRoutes'

describe('spaIndexPaths', () => {
  it('dækker hver statisk rute og ingen med parametre', () => {
    const staticPaths = appRoutes
      .map((route) => route.path.replace(/^\/+/, ''))
      .filter(
        (path) => path.length > 0 && !path.includes(':') && !path.includes('*'),
      )
      .sort()

    expect([...spaIndexPaths].sort()).toEqual(staticPaths)
  })

  it('lægger index.html i rutens mappe', () => {
    expect(spaIndexFile('kalender')).toBe('kalender/index.html')
    expect(spaIndexFile('/kalender/offentlig/')).toBe(
      'kalender/offentlig/index.html',
    )
    expect(() => spaIndexFile('/kalender/:eventId')).toThrow(
      'SPA_ROUTE_INVALID',
    )
  })
})
