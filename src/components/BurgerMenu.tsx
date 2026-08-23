import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useIsAdmin } from '../features/admin/useIsAdmin'
import { useAuth } from '../features/auth/useAuth'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { navLinks } from './navLinks'
import { InstallAppButton } from './InstallAppButton'

interface BurgerMenuProps {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export function BurgerMenu({ open, onClose, triggerRef }: BurgerMenuProps) {
  const { session, signOut } = useAuth()
  const { isAdmin } = useIsAdmin()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useDialogFocus<HTMLDivElement>({
    open,
    onClose,
    initialFocusRef: closeButtonRef,
    returnFocusRef: triggerRef,
  })

  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return

    const desktopQuery = window.matchMedia('(min-width: 48rem)')
    function closeAtDesktopWidth(event: MediaQueryListEvent) {
      if (event.matches) onClose()
    }

    if (desktopQuery.matches) {
      onClose()
      return
    }

    desktopQuery.addEventListener('change', closeAtDesktopWidth)
    return () => desktopQuery.removeEventListener('change', closeAtDesktopWidth)
  }, [onClose, open])

  const visibleLinks = navLinks.filter(
    (link) =>
      (!link.requiresAuth || session) && (!link.requiresAdmin || isAdmin),
  )

  if (!open) return null

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 bg-white p-4 shadow-xl md:hidden"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Luk menu"
            className="flex h-11 w-11 items-center justify-center rounded text-2xl text-green-900"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-11 items-center rounded px-3 py-2 text-lg ${
                  isActive ? 'bg-green-100 text-green-900' : 'text-green-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-green-100 pt-4">
          <InstallAppButton className="flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-lg text-green-800" />
          {session ? (
            <button
              type="button"
              onClick={async () => {
                await signOut()
                onClose()
              }}
              className="flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-lg text-green-800"
            >
              Log ud
            </button>
          ) : (
            <NavLink
              to="/login"
              onClick={onClose}
              className="flex min-h-11 items-center rounded px-3 py-2 text-lg text-green-800"
            >
              Log ind
            </NavLink>
          )}
        </div>
      </div>
    </>
  )
}
