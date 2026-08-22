import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useIsAdmin } from './useIsAdmin'

/** Kræver at brugeren er admin. Skal ligge inden i en ProtectedRoute. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useIsAdmin()

  if (loading) {
    return null
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
