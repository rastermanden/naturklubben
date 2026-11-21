import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'

vi.mock('convex/react', () => ({
  useQuery: () => [],
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}))

vi.mock('../features/auth/useCurrentProfile', () => ({
  useCurrentProfile: () => ({
    isLoading: false,
    profile: {
      _id: 'admin-1' as Id<'profiles'>,
      fullName: 'Admin',
      isAdmin: true,
    },
  }),
}))

vi.mock('../features/activities/ActivitiesSection', () => ({
  ActivitiesSection: () => null,
}))
vi.mock('../features/admin/AllowedEmailsSection', () => ({
  AllowedEmailsSection: () => null,
}))
vi.mock('../features/datePolls/DatePollsSection', () => ({
  DatePollsSection: () => null,
}))
vi.mock('../features/members/AdminRolesSection', () => ({
  AdminRolesSection: () => null,
}))
vi.mock('../features/notifications/NotificationToggle', () => ({
  NotificationToggle: () => null,
}))
vi.mock('../features/notifications/NotificationTypePreferences', () => ({
  NotificationTypePreferences: () => null,
}))

import AdminPage from './AdminPage'

afterEach(cleanup)

describe('AdminPage badges-sektion', () => {
  it('viser indstillinger, produktioner og badge-katalog med «Ny badge» i samme rækkefølge som V1', () => {
    render(
      <MemoryRouter initialEntries={['/admin?sektion=badges']}>
        <AdminPage />
      </MemoryRouter>,
    )

    const nominationsHeading = screen.getByRole('heading', {
      name: 'Indstillinger der venter',
    })
    const productionsHeading = screen.getByRole('heading', {
      name: 'Badges der skal laves',
    })
    const catalogHeading = screen.getByRole('heading', {
      name: 'Badge-katalog',
    })
    const newBadgeButton = screen.getByRole('button', { name: 'Ny badge' })

    expect(nominationsHeading).toBeTruthy()
    expect(productionsHeading).toBeTruthy()
    expect(catalogHeading).toBeTruthy()
    expect(newBadgeButton).toBeTruthy()

    expect(
      Boolean(
        nominationsHeading.compareDocumentPosition(productionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(
      Boolean(
        productionsHeading.compareDocumentPosition(catalogHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
  })
})
