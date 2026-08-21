import { Route, Routes } from 'react-router-dom'
import ActivitiesPage from './pages/ActivitiesPage'
import CalendarPage from './pages/CalendarPage'
import ChatPage from './pages/ChatPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import GalleryPage from './pages/GalleryPage'
import HeroPage from './pages/HeroPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import { ProtectedRoute } from './features/auth/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HeroPage />} />
      <Route path="/aktiviteter" element={<ActivitiesPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/opret" element={<SignupPage />} />
      <Route path="/glemt-adgangskode" element={<ForgotPasswordPage />} />
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
    </Routes>
  )
}

export default App
