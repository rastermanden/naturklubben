import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { navLinks } from './navLinks'

interface BurgerMenuProps {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export function BurgerMenu({ open, onClose, triggerRef }: BurgerMenuProps) {
  const { session, signOut } = useAuth()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, triggerRef])

  const visibleLinks = navLinks.filter((link) => !link.requiresAuth || session)

  function closeAndReturnFocus() {
    onClose()
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeAndReturnFocus}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 bg-white p-4 shadow-xl transition-transform duration-200 ease-out md:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
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
            onClick={closeAndReturnFocus}
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
              onClick={closeAndReturnFocus}
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

        <div className="mt-auto border-t border-green-100 pt-4">
          {session ? (
            <button
              type="button"
              onClick={async () => {
                await signOut()
                closeAndReturnFocus()
              }}
              className="flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-lg text-green-800"
            >
              Log ud
            </button>
          ) : (
            <NavLink
              to="/login"
              onClick={closeAndReturnFocus}
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
