import { useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useIsAdmin } from '../features/admin/useIsAdmin'
import { FeatureAnnouncementBanner } from '../features/announcements/FeatureAnnouncementBanner'
import { useAuth } from '../features/auth/useAuth'
import type { RouteMetadata } from '../routeMetadata'
import { navLinks } from './navLinks'
import { BurgerMenu } from './BurgerMenu'
import { Footer } from './Footer'
import { InstallAppButton } from './InstallAppButton'
import { RouteNavigation } from './RouteNavigation'

interface LayoutProps {
  routes: readonly RouteMetadata[]
}

export function Layout({ routes }: LayoutProps) {
  const { session, signOut } = useAuth()
  const { isAdmin } = useIsAdmin()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const burgerButtonRef = useRef<HTMLButtonElement>(null)
  const keepsContentInViewport = pathname === '/chat'

  const visibleLinks = navLinks.filter(
    (link) =>
      (!link.requiresAuth || session) && (!link.requiresAdmin || isAdmin),
  )

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
      <RouteNavigation routes={routes} />
      <header
        className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-line-soft bg-surface px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <NavLink to="/" className="text-lg font-semibold text-ink-body">
          Naturklubben
        </NavLink>

        <nav className="hidden items-center gap-4 md:flex">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded px-2 py-1 ${isActive ? 'font-medium text-ink-body' : 'text-ink-muted'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {session ? (
            <button
              type="button"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
              className="rounded px-2 py-1 text-ink-muted underline"
            >
              Log ud
            </button>
          ) : (
            <NavLink
              to="/login"
              className="rounded px-2 py-1 text-ink-muted underline"
            >
              Log ind
            </NavLink>
          )}
          <InstallAppButton className="rounded border border-line-strong px-3 py-1 text-ink-muted" />
        </nav>

        <button
          ref={burgerButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Åbn menu"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 items-center justify-center rounded text-ink-body md:hidden"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <BurgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        triggerRef={burgerButtonRef}
      />

      <div
        id="main-content"
        tabIndex={-1}
        className={`flex-1 ${
          keepsContentInViewport ? 'flex min-h-0 flex-col overflow-hidden' : ''
        }`}
      >
        {/* Nyheder om nye funktioner står i app-shellen og ikke på en enkelt
            side: det, der er nyt, skal møde medlemmet, hvor det nu åbner
            appen. */}
        {session && <FeatureAnnouncementBanner userId={session.user.id} />}
        <Outlet />
      </div>

      <Footer />
    </div>
  )
}
