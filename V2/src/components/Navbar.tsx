import { useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'
import { BurgerMenu } from './BurgerMenu'

export interface NavLinkItem {
  to: string
  label: string
  /** Skjules for ikke-indloggede. */
  requiresAuth?: boolean
  /** Skjules for alle andre end administratorer. */
  requiresAdmin?: boolean
}

/**
 * Bannerets links. Kun ruter, der findes i V2: de øvrige domæner (kalender,
 * billeder, chat) tilføjer deres egen linje, når de er portet -- et link til
 * en side uden rute ville føre til en tom skærm.
 */
export const navLinks: readonly NavLinkItem[] = [
  { to: '/', label: 'Forsiden' },
  { to: '/medlemmer', label: 'Medlemmer', requiresAuth: true },
  { to: '/profil', label: 'Min profil', requiresAuth: true },
  { to: '/admin', label: 'Admin', requiresAuth: true, requiresAdmin: true },
]

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded px-3 py-2 text-sm ${
    isActive ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink'
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
  const { signOut } = useAuthActions()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const visibleLinks = navLinks.filter(
    (link) =>
      (!link.requiresAuth || isAuthenticated) &&
      (!link.requiresAdmin || profile?.isAdmin === true),
  )

  return (
    <header className="border-b border-line bg-surface px-4 py-2">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
        <Link to="/" className="text-lg font-semibold text-ink">
          Naturklubben
        </Link>

        <nav aria-label="Hovedmenu" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-1">
            {visibleLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === '/'}
                  className={desktopLinkClass}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="hidden min-h-11 rounded px-3 py-2 text-sm text-ink-muted md:block"
            >
              Log ud
            </button>
          ) : (
            <NavLink
              to="/login"
              className="hidden min-h-11 items-center rounded px-3 py-2 text-sm text-ink-muted md:flex"
            >
              Log ind
            </NavLink>
          )}

          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Åbn menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded text-2xl text-ink-body md:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      <BurgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        triggerRef={menuButtonRef}
        links={visibleLinks}
      />
    </header>
  )
}
