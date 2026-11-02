import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))

vi.mock('../features/auth/useCurrentProfile', () => ({
  useCurrentProfile: () => ({
    isLoading: false,
    profile: { isAdmin: true },
  }),
}))

vi.mock('../features/theme/ThemeToggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('./InstallAppButton', () => ({
  InstallAppButton: () => null,
}))

import { Navbar, navLinks } from './Navbar'

afterEach(cleanup)

describe('Navbar', () => {
  it('har de samme menupunkter som den nuværende app, inklusive admin-chat', () => {
    expect(navLinks.map((link) => link.label)).toEqual([
      'Forside',
      'Aktiviteter',
      'Kalender',
      'Billeder',
      'Chat',
      'Medlemmer',
      'Nyheder',
      'Profil',
      'Admin',
      'Admin-chat',
    ])
    expect(navLinks.find((link) => link.label === 'Admin-chat')?.to).toBe(
      '/admin/chat',
    )
    expect(
      navLinks.find((link) => link.label === 'Aktiviteter')?.alsoActiveFor,
    ).toEqual(['/naturlog', '/spil'])
  })

  it('viser admin-chat i burgermenuen for en administrator', () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Åbn menu' }))
    const menu = screen.getByRole('dialog', { name: 'Navigation' })
    const link = within(menu).getByRole('link', { name: 'Admin-chat' })
    expect(link.getAttribute('href')).toBe('/admin/chat')
  })
})
