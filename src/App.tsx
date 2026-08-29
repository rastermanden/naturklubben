import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import HeroPage from './pages/HeroPage'
import { AdminRoute } from './features/admin/AdminRoute'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { routeMetadata, type AppRoutePath } from './routeMetadata'

const AccountDeletedPage = lazy(() => import('./pages/AccountDeletedPage'))
const ActivitiesPage = lazy(() => import('./pages/ActivitiesPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const DataPolicyPage = lazy(() => import('./pages/DataPolicyPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const GalleryPage = lazy(() => import('./pages/GalleryPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const NewsPage = lazy(() => import('./pages/NewsPage'))
const ProbationApplicationPage = lazy(
  () => import('./pages/ProbationApplicationPage'),
)
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const WelcomePage = lazy(() => import('./pages/WelcomePage'))

function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-h-48 items-center justify-center p-6 text-green-800"
    >
      Indlæser siden…
    </div>
  )
}

function loadRoute(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <ErrorBoundary
      key={location.key}
      variant="route"
      reportSource="react-route"
    >
      {children}
    </ErrorBoundary>
  )
}

const routeElements: Record<AppRoutePath, ReactNode> = {
  '/': <HeroPage />,
  '/aktiviteter': loadRoute(<ActivitiesPage />),
  '/datapolitik': loadRoute(<DataPolicyPage />),
  '/konto-slettet': loadRoute(<AccountDeletedPage />),
  '/login': loadRoute(<LoginPage />),
  '/proevemedlemskab': loadRoute(<ProbationApplicationPage />),
  '/opret': loadRoute(<SignupPage />),
  '/glemt-adgangskode': loadRoute(<ForgotPasswordPage />),
  '/velkommen': loadRoute(<WelcomePage />),
  '/ny-adgangskode': loadRoute(<ResetPasswordPage />),
  '/kalender': <ProtectedRoute>{loadRoute(<CalendarPage />)}</ProtectedRoute>,
  '/billeder': <ProtectedRoute>{loadRoute(<GalleryPage />)}</ProtectedRoute>,
  '/chat': <ProtectedRoute>{loadRoute(<ChatPage />)}</ProtectedRoute>,
  '/medlemmer': <ProtectedRoute>{loadRoute(<MembersPage />)}</ProtectedRoute>,
  '/nyheder': <ProtectedRoute>{loadRoute(<NewsPage />)}</ProtectedRoute>,
  '/admin': (
    <ProtectedRoute>
      <AdminRoute>{loadRoute(<AdminPage />)}</AdminRoute>
    </ProtectedRoute>
  ),
  '/profil': <ProtectedRoute>{loadRoute(<ProfilePage />)}</ProtectedRoute>,
}

function App() {
  return (
    <Routes>
      <Route element={<Layout routes={routeMetadata} />}>
        {routeMetadata.map(({ path }) => (
          <Route
            key={path}
            path={path}
            element={
              <RouteErrorBoundary>{routeElements[path]}</RouteErrorBoundary>
            }
          />
        ))}
      </Route>
    </Routes>
  )
}

export default App
