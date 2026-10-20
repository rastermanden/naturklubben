import { useEffect, useRef, type RefObject } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'
import type { NavLinkItem } from './Navbar'

interface BurgerMenuProps {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  links: readonly NavLinkItem[]
}

/**
 * Skuffemenuen på smalle skærme.
 *
 * Fokus flyttes ind i panelet, når det åbner, og tilbage til hamburgerknappen,
 * når det lukker. Escape lukker. Der er bevidst ingen fuld fokusfælde: den
 * gamle apps `useDialogFocus` ligger i `src/hooks/`, som ikke ejes af denne
 * slice, og en halv fælde er værre end ingen -- se rapporten.
 */
export function BurgerMenu({
  open,
  onClose,
  triggerRef,
  links,
}: BurgerMenuProps) {
  const { isAuthenticated } = useConvexAuth()
  const { signOut } = useAuthActions()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    panelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      triggerRef.current?.focus()
    }
  }, [onClose, open, triggerRef])

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
        className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 bg-surface p-4 shadow-xl md:hidden"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk menu"
            className="flex h-11 w-11 items-center justify-center rounded text-2xl text-ink-body"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-11 items-center rounded px-3 py-2 text-lg ${
                  isActive ? 'bg-surface-raised text-ink-body' : 'text-ink-muted'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-line-soft pt-4">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={async () => {
                await signOut()
                onClose()
              }}
              className="flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-lg text-ink-muted"
            >
              Log ud
            </button>
          ) : (
            <NavLink
              to="/login"
              onClick={onClose}
              className="flex min-h-11 items-center rounded px-3 py-2 text-lg text-ink-muted"
            >
              Log ind
            </NavLink>
          )}
        </div>
      </div>
    </>
  )
}
