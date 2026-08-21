import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

/**
 * Minimal login/log ud-status vist øverst på hver side, indtil app-shell'et
 * med burger-menu (#8) erstatter den med rigtig navigation.
 */
export function AuthStatusLink() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  if (!session) {
    return (
      <Link to="/login" className="text-sm text-green-800 underline">
        Log ind
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await signOut()
        navigate('/')
      }}
      className="text-sm text-green-800 underline"
    >
      Log ud
    </button>
  )
}
