import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * Én fejlgrænse pr. side. Nøglen er location.key, så en ny navigation --
 * også `replace` -- starter siden forfra og ikke arver en fejl fra den
 * forrige. Konsekvensen er, at al lokal state på siden også nulstilles ved
 * navigation; en side, der vil beholde noget på tværs af en URL-ændring, må
 * lade være med at navigere, mens den har det åbent.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <ErrorBoundary
      key={location.key}
      variant="route"
      reportSource="react-route"
    >
      {children}
    </ErrorBoundary>
  )
}
