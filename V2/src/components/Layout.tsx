import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { useConvexAuth } from 'convex/react'
import { FeatureAnnouncementBanner } from '../features/announcements/FeatureAnnouncementBanner'
import { PronounsReminder } from '../features/profile/PronounsReminder'
import { routeMetadata } from '../routeMetadata'
import { AppErrorBoundary } from './AppErrorBoundary'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { RouteNavigation } from './RouteNavigation'

/**
 * Samme ramme som den nuværende app: header, indhold i sidernes egen bredde,
 * footer. Chatten fylder skærmen, så footeren udelades der.
 */
export function Layout() {
  const { isAuthenticated } = useConvexAuth()
  const { pathname } = useLocation()
  // Kun den fælles chat fylder skærmen. Admin-chatten beholder footeren,
  // som i den nuværende app.
  const keepsContentInViewport = pathname === '/chat'

  return (
    <div
      className={`flex flex-col ${
        keepsContentInViewport ? 'h-dvh overflow-hidden' : 'min-h-svh'
      }`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded focus:bg-surface focus:px-4 focus:py-3 focus:font-medium focus:text-ink"
      >
        Spring til indhold
      </a>
      <Navbar />
      <RouteNavigation routes={routeMetadata} />

      <div
        id="main-content"
        tabIndex={-1}
        className={`flex flex-1 flex-col ${
          keepsContentInViewport ? 'min-h-0 overflow-hidden' : ''
        }`}
      >
        <AppErrorBoundary>
          <FeatureAnnouncementBanner />
          {isAuthenticated && <PronounsReminder />}
          <Outlet />
        </AppErrorBoundary>
      </div>

      {!keepsContentInViewport && <Footer />}
    </div>
  )
}
