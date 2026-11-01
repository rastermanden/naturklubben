import { useEffect, useRef, type RefObject } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useConvexAuth } from 'convex/react'
import { InstallAppButton } from './InstallAppButton'
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { navLinkIsActive, type NavLinkItem } from './Navbar'

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
  const { pathname } = useLocation()
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
        className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 overflow-y-auto overscroll-contain bg-surface p-4 shadow-xl md:hidden"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk menu"
            className="flex h-11 w-11 items-center justify-center rounded text-2xl text-ink-body"
          >
            ×
          </button>
        </div>

        <nav
          aria-label="Menupunkter"
          className="flex min-h-40 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center rounded px-3 py-2 text-base ${
                  navLinkIsActive(link, pathname, isActive)
                    ? 'bg-surface-raised text-ink-body'
                    : 'text-ink-muted'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 flex-col gap-0.5 border-t border-line-soft pt-3">
          <ThemeToggle className="mb-2" />
          <InstallAppButton className="flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-base text-ink-muted" />
          {!isAuthenticated && (
            <NavLink
              to="/login"
              onClick={onClose}
              className="flex min-h-11 items-center rounded px-3 py-2 text-base text-ink-muted"
            >
              Log ind
            </NavLink>
          )}
        </div>
      </div>
    </>
  )
}
