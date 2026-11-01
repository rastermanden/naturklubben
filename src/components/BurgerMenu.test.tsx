import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BurgerMenu } from './BurgerMenu'
import { navLinks } from './navLinks'

const mocks = vi.hoisted(() => ({
  session: null as object | null,
  isAdmin: false,
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    session: mocks.session,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../features/admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: mocks.isAdmin }),
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
  mocks.session = null
  mocks.isAdmin = false
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

  // jsdom har intet layout, så højden kan ikke måles her -- men det er netop
  // klasserne, der afgør, om listen kan scrolles på en lav skærm (#283).
  it('lader den lange admin-liste scrolle, mens knapperne bliver stående', () => {
    mocks.session = { user: { id: 'admin-id' } }
    mocks.isAdmin = true
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Åbn menu' }))

    const list = screen.getByRole('navigation', { name: 'Menupunkter' })
    expect(list.querySelectorAll('a')).toHaveLength(navLinks.length)
    expect(list.className).toMatch(/\boverflow-y-auto\b/)
    expect(list.className).toMatch(/\bflex-1\b/)
    expect(list.className).toMatch(/\boverscroll-contain\b/)

    // Hvert link er stadig mindst 44 px højt, så de er nemme at ramme.
    for (const link of list.querySelectorAll('a')) {
      expect(link.className).toMatch(/\bmin-h-11\b/)
      expect(link.className).toMatch(/\bshrink-0\b/)
    }

    // Luk-knappen og log ud ligger uden for scroll-området.
    expect(
      list.contains(screen.getByRole('button', { name: 'Luk menu' })),
    ).toBe(false)
    expect(list.contains(screen.getByRole('button', { name: 'Log ud' }))).toBe(
      false,
    )
  })
})
