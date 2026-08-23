import ProfilePage from './pages/ProfilePage'
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

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HeroPage />} />
        <Route path="/aktiviteter" element={<ActivitiesPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/proevemedlemskab"
          element={<ProbationApplicationPage />}
        />
        <Route path="/opret" element={<SignupPage />} />
        <Route path="/glemt-adgangskode" element={<ForgotPasswordPage />} />
        {/* Landingssider for links i mails fra Supabase. */}
        <Route path="/velkommen" element={<WelcomePage />} />
        <Route path="/ny-adgangskode" element={<ResetPasswordPage />} />
        <Route
          path="/kalender"
          element={
            <ProtectedRoute>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billeder"
          element={
            <ProtectedRoute>
              <GalleryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/medlemmer"
          element={
            <ProtectedRoute>
              <MembersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profil"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}

export default App
