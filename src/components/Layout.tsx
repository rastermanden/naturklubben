import { useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { navLinks } from './navLinks'
import { BurgerMenu } from './BurgerMenu'

export function Layout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const burgerButtonRef = useRef<HTMLButtonElement>(null)

  const visibleLinks = navLinks.filter((link) => !link.requiresAuth || session)

  return (
    <div className="flex min-h-svh flex-col">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-green-100 bg-white px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <NavLink to="/" className="text-lg font-semibold text-green-900">
          Naturklubben
        </NavLink>

        <nav className="hidden items-center gap-4 md:flex">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded px-2 py-1 ${isActive ? 'font-medium text-green-900' : 'text-green-800'}`
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
              className="rounded px-2 py-1 text-green-800 underline"
            >
              Log ud
            </button>
          ) : (
            <NavLink
              to="/login"
              className="rounded px-2 py-1 text-green-800 underline"
            >
              Log ind
            </NavLink>
          )}
        </nav>

        <button
          ref={burgerButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Åbn menu"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 items-center justify-center rounded text-green-900 md:hidden"
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

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
