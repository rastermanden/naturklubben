import type { AppRoute } from '../../routes'
import AudioPage from '../../pages/AudioPage'
import { ProtectedRoute } from '../auth/ProtectedRoute'

/**
 * Lydsidens rute. Ligger bag `ProtectedRoute`, fordi kun medlemmer må se,
 * uploade og afspille klubbens lydfiler.
 */
export const audioRoutes: AppRoute[] = [
  {
    path: '/lyd',
    element: (
      <ProtectedRoute>
        <AudioPage />
      </ProtectedRoute>
    ),
  },
]
