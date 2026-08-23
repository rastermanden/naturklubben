import type { ReactNode } from 'react'
import ProfilePage from './pages/ProfilePage'
import AccountDeletedPage from './pages/AccountDeletedPage'
import DataPolicyPage from './pages/DataPolicyPage'
import { Route, Routes } from 'react-router-dom'
import ActivitiesPage from './pages/ActivitiesPage'
import AdminPage from './pages/AdminPage'
import CalendarPage from './pages/CalendarPage'
import ChatPage from './pages/ChatPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import GalleryPage from './pages/GalleryPage'
import HeroPage from './pages/HeroPage'
import LoginPage from './pages/LoginPage'
import MembersPage from './pages/MembersPage'
import ProbationApplicationPage from './pages/ProbationApplicationPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SignupPage from './pages/SignupPage'
import WelcomePage from './pages/WelcomePage'
import { AdminRoute } from './features/admin/AdminRoute'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { Layout } from './components/Layout'
import { routeMetadata, type AppRoutePath } from './routeMetadata'

const routeElements: Record<AppRoutePath, ReactNode> = {
  '/': <HeroPage />,
  '/aktiviteter': <ActivitiesPage />,
  '/datapolitik': <DataPolicyPage />,
  '/konto-slettet': <AccountDeletedPage />,
  '/login': <LoginPage />,
  '/proevemedlemskab': <ProbationApplicationPage />,
  '/opret': <SignupPage />,
  '/glemt-adgangskode': <ForgotPasswordPage />,
  '/velkommen': <WelcomePage />,
  '/ny-adgangskode': <ResetPasswordPage />,
  '/kalender': (
    <ProtectedRoute>
      <CalendarPage />
    </ProtectedRoute>
  ),
  '/billeder': (
    <ProtectedRoute>
      <GalleryPage />
    </ProtectedRoute>
  ),
  '/chat': (
    <ProtectedRoute>
      <ChatPage />
    </ProtectedRoute>
  ),
  '/medlemmer': (
    <ProtectedRoute>
      <MembersPage />
    </ProtectedRoute>
  ),
  '/admin': (
    <ProtectedRoute>
      <AdminRoute>
        <AdminPage />
      </AdminRoute>
    </ProtectedRoute>
  ),
  '/profil': (
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  ),
}

function App() {
  return (
    <Routes>
      <Route element={<Layout routes={routeMetadata} />}>
        {routeMetadata.map(({ path }) => (
          <Route key={path} path={path} element={routeElements[path]} />
        ))}
      </Route>
    </Routes>
  )
}

export default App
