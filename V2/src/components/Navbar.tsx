import { useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useConvexAuth } from 'convex/react'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'
import { BurgerMenu } from './BurgerMenu'
import { InstallAppButton } from './InstallAppButton'

export interface NavLinkItem {
  to: string
  label: string
  /** Skjules for ikke-indloggede. */
  requiresAuth?: boolean
  /** Skjules for alle andre end administratorer. */
  requiresAdmin?: boolean
  /** Undersider, der også markerer punktet -- Naturlog og Spil under Aktiviteter. */
  alsoActiveFor?: readonly string[]
}

export function navLinkIsActive(
  link: NavLinkItem,
  pathname: string,
  routerIsActive: boolean,
): boolean {
  if (routerIsActive) return true
  return (link.alsoActiveFor ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

/**
 * Bannerets links. Nye sider føjes til, når de er klar til medlemmerne.
 * Naturlog og Spil ligger under Aktiviteter, ikke som egne punkter.
 */
export const navLinks: readonly NavLinkItem[] = [
  { to: '/', label: 'Forside' },
  {
    to: '/aktiviteter',
    label: 'Aktiviteter',
    alsoActiveFor: ['/naturlog', '/spil'],
  },
  { to: '/kalender', label: 'Kalender', requiresAuth: true },
  { to: '/billeder', label: 'Billeder', requiresAuth: true },
  { to: '/chat', label: 'Chat', requiresAuth: true },
  { to: '/medlemmer', label: 'Medlemmer', requiresAuth: true },
  { to: '/nyheder', label: 'Nyheder', requiresAuth: true },
  { to: '/profil', label: 'Profil', requiresAuth: true },
  { to: '/admin', label: 'Admin', requiresAuth: true, requiresAdmin: true },
  {
    to: '/admin/chat',
    label: 'Admin-chat',
    requiresAuth: true,
    requiresAdmin: true,
  },
]

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 ${
    isActive ? 'font-medium text-ink-body' : 'text-ink-muted'
  }`

/**
 * Toppen af appen: navn, links og log ind/ud.
 *
 * `Layout.tsx` tegner i dag sin egen, midlertidige header. Den skal skifte til
 * `<Navbar />`, når skuffemenuen og temaet er koblet på; indtil da er ingen af
 * dem vist nogen steder.
 *
 * Temavælgeren (`features/theme/ThemeToggle.tsx`) står ikke i menuen endnu,
 * fordi den kræver en `ThemeProvider` i `main.tsx`, og den fil ejes ikke af
 * denne slice -- se rapporten.
 */
export function Navbar() {
  const { isAuthenticated } = useConvexAuth()
  const { profile } = useCurrentProfile()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const visibleLinks = navLinks.filter(
    (link) =>
      (!link.requiresAuth || isAuthenticated) &&
      (!link.requiresAdmin || profile?.isAdmin === true),
  )

  return (
    <header
      className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-line-soft bg-surface px-4 py-3"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <Link to="/" className="text-lg font-semibold text-ink-body">
        Naturklubben
      </Link>

      <nav className="hidden min-w-0 flex-1 items-center gap-4 overflow-x-auto md:flex">
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              desktopLinkClass({
                isActive: navLinkIsActive(link, pathname, isActive),
              })
            }
          >
            {link.label}
          </NavLink>
        ))}
        <InstallAppButton className="rounded border border-line-strong px-3 py-1 text-ink-muted" />
        {!isAuthenticated && (
          <NavLink
            to="/login"
            className="rounded px-2 py-1 text-ink-muted underline"
          >
            Log ind
          </NavLink>
        )}
      </nav>

      <button
        ref={menuButtonRef}
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

      <BurgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        triggerRef={menuButtonRef}
        links={visibleLinks}
      />
    </header>
  )
}
