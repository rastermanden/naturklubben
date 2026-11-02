import type { AppRoute } from '../../routes'
import GalleryPage from '../../pages/GalleryPage'
import { ProtectedRoute } from '../auth/ProtectedRoute'

/**
 * Galleriets ruter.
 *
 * `/billeder` ligger bag `ProtectedRoute`, fordi alle galleriets queries kræver
 * et medlem (se `convex/gallery.ts`): uden en profil svarer de med
 * `NOT_A_MEMBER`, og det skal være en indlogningsside og ikke en tom side.
 *
 * `ProtectedRoute` ejes af auth-slicen (`src/features/auth/ProtectedRoute.tsx`)
 * og findes endnu ikke i denne branch; se rapporten.
 */
export const galleryRoutes: AppRoute[] = [
  {
    path: '/billeder',
    element: (
      <ProtectedRoute>
        <GalleryPage />
      </ProtectedRoute>
    ),
  },
]
