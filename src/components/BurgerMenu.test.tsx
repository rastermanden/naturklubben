import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BurgerMenu } from './BurgerMenu'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    session: null,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../features/admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: false }),
}))

vi.mock('./InstallAppButton', () => ({
  InstallAppButton: () => null,
}))

// Testen handler om fokus og lukning, ikke om udseende. Temavælgeren stubbes
// derfor væk, præcis som InstallAppButton -- ellers ville den trække en
// ThemeProvider og et matchMedia-svar med ind, som testen selv stubber om på.
vi.mock('../features/theme/ThemeToggle', () => ({
  ThemeToggle: () => null,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Harness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Åbn menu
      </button>
      <BurgerMenu
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      />
    </>
  )
}

describe('BurgerMenu', () => {
  it('does not expose a closed menu and restores focus after backdrop close', () => {
    const { container } = render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('dialog')).toBe(null)
    const trigger = screen.getByRole('button', { name: 'Åbn menu' })
    trigger.focus()
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: 'Navigation' })).not.toBe(null)
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Luk menu' }),
    )

    fireEvent.click(container.querySelector('[aria-hidden="true"]')!)

    expect(screen.queryByRole('dialog')).toBe(null)
    expect(document.activeElement).toBe(trigger)
  })

  it('closes if the viewport changes to the desktop navigation', () => {
    let handleChange: ((event: MediaQueryListEvent) => void) | undefined
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (
        _event: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        handleChange = listener
      },
      removeEventListener: vi.fn(),
    }))

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Åbn menu' }))
    expect(screen.getByRole('dialog', { name: 'Navigation' })).not.toBe(null)

    act(() => handleChange?.({ matches: true } as MediaQueryListEvent))

    expect(screen.queryByRole('dialog')).toBe(null)
  })
})
