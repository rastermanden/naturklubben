import type { AppRoute } from '../../routes'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import ActivitiesPage from '../../pages/ActivitiesPage'
import CalendarPage from '../../pages/CalendarPage'
import HeroPage from '../../pages/HeroPage'
import PublicCalendarPage from '../../pages/PublicCalendarPage'

/**
 * Kalenderens og aktiviteternes ruter.
 *
 * Rækkefølgen betyder noget: `/kalender/offentlig` skal stå før
 * `/kalender/:eventId`, ellers ville den offentlige side blive læst som en
 * begivenhed med id'et "offentlig".
 *
 * Den offentlige kalender og aktivitetssiden kan ses uden login -- de viser
 * henholdsvis kun begivenheder, en arrangør har åbnet, og klubbens eget
 * præsentationsindhold. Resten er pakket i `ProtectedRoute`.
 */
export const calendarRoutes: AppRoute[] = [
  { path: '/', element: <HeroPage /> },
  { path: '/aktiviteter', element: <ActivitiesPage /> },
  { path: '/kalender/offentlig', element: <PublicCalendarPage /> },
  {
    path: '/kalender',
    element: (
      <ProtectedRoute>
        <CalendarPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/kalender/:eventId',
    element: (
      <ProtectedRoute>
        <CalendarPage />
      </ProtectedRoute>
    ),
  },
]
