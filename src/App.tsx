import { Route, Routes } from 'react-router-dom'
import ActivitiesPage from './pages/ActivitiesPage'
import CalendarPage from './pages/CalendarPage'
import ChatPage from './pages/ChatPage'
import GalleryPage from './pages/GalleryPage'
import HeroPage from './pages/HeroPage'
import LoginPage from './pages/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HeroPage />} />
      <Route path="/aktiviteter" element={<ActivitiesPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/kalender" element={<CalendarPage />} />
      <Route path="/billeder" element={<GalleryPage />} />
      <Route path="/chat" element={<ChatPage />} />
    </Routes>
  )
}

export default App
