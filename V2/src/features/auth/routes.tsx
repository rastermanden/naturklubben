import type { AppRoute } from '../../routes'
import AccountDeletedPage from '../../pages/AccountDeletedPage'
import AdminPage from '../../pages/AdminPage'
import DataPolicyPage from '../../pages/DataPolicyPage'
import ForgotPasswordPage from '../../pages/ForgotPasswordPage'
import LoginPage from '../../pages/LoginPage'
import MembersPage from '../../pages/MembersPage'
import ProfilePage from '../../pages/ProfilePage'
import ResetPasswordPage from '../../pages/ResetPasswordPage'
import SignupPage from '../../pages/SignupPage'
import WelcomePage from '../../pages/WelcomePage'
import { AdminRoute } from './AdminRoute'
import { ProtectedRoute } from './ProtectedRoute'

/**
 * Auth- og medlemsruterne.
 *
 * `routes.tsx` i `src/` samler dem med `...authRoutes`. Stierne er de samme som
 * i den gamle app (`/login`, `/opret`, `/glemt-adgangskode`,
 * `/ny-adgangskode`, `/velkommen`, `/profil`, `/medlemmer`, `/admin`), så et
 * gammelt bogmærke eller et link i en mail stadig virker.
 *
 * `/admin` kræver to lag: `ProtectedRoute` for medlemskabet og `AdminRoute`
 * for rollen. Rækkefølgen betyder noget -- den ydre afgør først, om der er en
 * profil at spørge om rollen på.
 */
export const authRoutes: AppRoute[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/opret', element: <SignupPage /> },
  { path: '/glemt-adgangskode', element: <ForgotPasswordPage /> },
  { path: '/ny-adgangskode', element: <ResetPasswordPage /> },
  { path: '/velkommen', element: <WelcomePage /> },
  { path: '/konto-slettet', element: <AccountDeletedPage /> },
  { path: '/datapolitik', element: <DataPolicyPage /> },
  {
    path: '/profil',
    element: (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/medlemmer',
    element: (
      <ProtectedRoute>
        <MembersPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AdminRoute>
          <AdminPage />
        </AdminRoute>
      </ProtectedRoute>
    ),
  },
]
