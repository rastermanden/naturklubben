import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return null
  }

  if (!session) {
    return (
      <Navigate
        to="/"
        state={{ authRequired: true, from: location.pathname }}
        replace
      />
    )
  }

  return <>{children}</>
}
