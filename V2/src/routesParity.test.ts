import { describe, expect, it, vi } from 'vitest'

vi.mock('./lib/convexClient', () => ({ convex: {} }))
vi.mock('convex/react', () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
}))

import { appRoutes } from './routes'

/** Stierne i den nuværende app (`src/App.tsx`). */
const v1Paths = [
  '/',
  '/aktiviteter',
  '/aktiviteter/btg-turnering',
  '/datapolitik',
  '/konto-slettet',
  '/login',
  '/proevemedlemskab',
  '/opret',
  '/glemt-adgangskode',
  '/velkommen',
  '/ny-adgangskode',
  '/kalender',
  '/kalender/offentlig',
  '/kalender/:eventId',
  '/billeder',
  '/chat',
  '/naturlog',
  '/spil',
  '/spil/tetris',
  '/spil/kaper',
  '/spil/2048',
  '/spil/naturquiz',
  '/spil/sti',
  '/spil/fugletraek',
  '/spil/kabale',
  '/medlemmer',
  '/nyheder',
  '/admin',
  '/admin/chat',
  '/profil',
]

describe('ruter', () => {
  it('har alle den nuværende apps stier', () => {
    const paths = new Set(appRoutes.map((route) => route.path))
    for (const path of v1Paths) {
      expect(paths.has(path), path).toBe(true)
    }
  })
})
