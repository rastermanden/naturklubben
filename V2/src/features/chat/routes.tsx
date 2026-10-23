import type { AppRoute } from '../../routes'
import { AdminRoute, ProtectedRoute } from '../auth'
import AdminChatPage from '../../pages/AdminChatPage'
import ChatPage from '../../pages/ChatPage'

/**
 * Chatternes ruter.
 *
 * `ProtectedRoute` og `AdminRoute` er kun en visningsguard: de gør, at et
 * medlem uden adgang ikke ser en side, der alligevel ikke kan hente noget. Det,
 * der beskytter data, er backend'en -- hver funktion i `convex/chat.ts` kalder
 * `requireProfile`, `requireWritableProfile` eller kræver `isAdmin` gennem
 * `requireRoomAccess`. Se V2/README.md, "Autorisation".
 */
export const chatRoutes: AppRoute[] = [
  {
    path: '/chat',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/chat',
    element: (
      <ProtectedRoute>
        <AdminRoute>
          <AdminChatPage />
        </AdminRoute>
      </ProtectedRoute>
    ),
  },
]
