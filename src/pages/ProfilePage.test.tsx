import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'member-id', email: 'medlem@example.com' } },
  }),
}))
vi.mock('../features/account/DeleteAccountSection', () => ({
  DeleteAccountSection: () => null,
}))
// Badge-vitrinen har sin egen test. Her ville den bare trække react-query og
// Supabase med ind i en test om avatar-fejlbeskeden.
vi.mock('../features/badges/BadgeShowcase', () => ({
  BadgeShowcase: () => null,
}))
vi.mock('../features/badges/useMemberBadges', () => ({
  useMemberBadges: () => ({ data: [] }),
  groupBadgesByMember: () => new Map(),
}))
vi.mock('../features/members/useMembers', () => ({
  useMembers: () => ({ data: [] }),
}))
vi.mock('../lib/supabaseClient', () => {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  profileQuery.select.mockReturnValue(profileQuery)
  profileQuery.eq.mockReturnValue(profileQuery)
  return {
    supabase: {
      from: vi.fn(() => profileQuery),
      storage: { from: vi.fn() },
    },
  }
})

import ProfilePage from './ProfilePage'

afterEach(cleanup)

describe('ProfilePage form errors', () => {
  it('links an invalid avatar to the file field and focuses its visible trigger', async () => {
    render(<ProfilePage />)

    const fileInput = screen.getByLabelText('Vælg profilbillede')
    const trigger = screen.getByRole('button', { name: 'Skift profilbillede' })
    trigger.focus()
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['tekst'], 'avatar.txt', { type: 'text/plain' })],
      },
    })

    const error = await screen.findByText('Filen er ikke et billede.')
    expect(fileInput.getAttribute('aria-invalid')).toBe('true')
    expect(fileInput.getAttribute('aria-describedby')).toBe(error.id)
    expect(trigger.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
