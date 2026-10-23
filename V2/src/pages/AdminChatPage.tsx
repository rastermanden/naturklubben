import ChatPage from './ChatPage'

/**
 * Samme chat som #14, men bundet til admin-rummet (#212).
 *
 * Adgangen håndhæves i backend: hver funktion i `convex/chat.ts`, der rører
 * admin-rummet, kræver `isAdmin` gennem `requireAdmin`-reglen i
 * `requireRoomAccess`. Denne side er kun den samme visning med et andet rum.
 */
function AdminChatPage() {
  return <ChatPage room="admin" />
}

export default AdminChatPage
