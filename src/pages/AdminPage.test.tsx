import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  addEmail: vi.fn(),
  applications: [] as unknown[],
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'admin-id' } } }),
}))
vi.mock('../features/admin/useAllowedEmails', () => ({
  useAllowedEmails: () => ({
    allowedEmailsQuery: {
      data: [],
      isPending: false,
      isError: false,
      isSuccess: true,
    },
    addEmail: { mutateAsync: mocks.addEmail, isPending: false },
    removeEmail: { mutateAsync: vi.fn(), isPending: false },
  }),
  toFriendlyAllowedEmailError: () => 'Den e-mail står allerede på listen.',
}))
vi.mock('../features/probation/useProbationApplications', () => ({
  useProbationApplications: () => ({
    applicationsQuery: {
      data: mocks.applications,
      isPending: false,
      isError: false,
      isSuccess: true,
    },
    approveApplication: { mutateAsync: vi.fn(), isPending: false },
    rejectApplication: { mutateAsync: vi.fn(), isPending: false },
    retryNotification: { mutateAsync: vi.fn(), isPending: false },
  }),
  toFriendlyProbationApplicationError: () => 'Ansøgningen fejlede.',
}))
vi.mock('../features/notifications/NotificationToggle', () => ({
  NotificationToggle: () => null,
}))
vi.mock('../features/admin/AdminRolesSection', () => ({
  AdminRolesSection: () => <p>Medlemsliste</p>,
}))
// Aktivitetssektionen har sin egen test og taler ellers med Supabase.
vi.mock('../features/activities/ActivitiesSection', () => ({
  ActivitiesSection: () => <p>Aktivitetsliste</p>,
}))
// Badge-sektionerne har deres egne tests. Her holdes de ude, så testen af
// invitationsformularen ikke også skal stille en Supabase-klient til rådighed.
vi.mock('../features/badges/BadgeCatalogSection', () => ({
  BadgeCatalogSection: () => null,
}))
vi.mock('../features/badges/BadgeNominationsSection', () => ({
  BadgeNominationsSection: () => null,
}))
vi.mock('../features/badges/BadgeProductionsSection', () => ({
  BadgeProductionsSection: () => null,
}))
// Siden selv henter de åbne nomineringer for at kunne vise tallet på fanen.
vi.mock('../features/badges/useBadgeNominations', () => ({
  useBadgeNominations: () => ({ data: [] }),
}))

import AdminPage from './AdminPage'

function renderAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.applications = []
})

afterEach(cleanup)

describe('AdminPage sections', () => {
  it('opens on the applications tab, so the only queue lands first', () => {
    renderAdmin()

    expect(
      screen
        .getByRole('tab', { name: /Ansøgninger/ })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('heading', { name: /Ansøgninger om prøvemedlemskab/ }),
    ).toBeTruthy()
  })

  it('shows only the selected section, not every section at once', () => {
    renderAdmin()

    expect(screen.queryByLabelText('E-mail')).toBeNull()
    expect(screen.queryByText('Medlemsliste')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Adgang' }))

    expect(screen.getByLabelText('E-mail')).toBeTruthy()
    expect(
      screen.queryByRole('heading', { name: /Ansøgninger om prøvemedlemskab/ }),
    ).toBeNull()
  })

  it('keeps the invite form next to the list it writes to', () => {
    renderAdmin()
    fireEvent.click(screen.getByRole('tab', { name: 'Adgang' }))

    expect(
      screen.getByRole('heading', { name: 'Inviter en e-mail' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Tilladte e-mails' }),
    ).toBeTruthy()
  })

  it('restores the section named in the URL', () => {
    renderAdmin('/admin?sektion=medlemmer')

    expect(screen.getByText('Medlemsliste')).toBeTruthy()
    expect(
      screen
        .getByRole('tab', { name: 'Medlemmer' })
        .getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('falls back to the default section for an unknown URL value', () => {
    renderAdmin('/admin?sektion=findes-ikke')

    expect(
      screen
        .getByRole('tab', { name: /Ansøgninger/ })
        .getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('counts waiting applications in the tab', () => {
    mocks.applications = [{ id: 1 }, { id: 2 }]
    renderAdmin()

    expect(
      screen.getByRole('tab', { name: 'Ansøgninger, 2 venter' }),
    ).toBeTruthy()
  })

  it('leaves the badge off when nothing is waiting', () => {
    renderAdmin()

    expect(screen.getByRole('tab', { name: 'Ansøgninger' })).toBeTruthy()
  })
})

describe('AdminPage invite form errors', () => {
  it('links a duplicate server error to e-mail and focuses the field', async () => {
    mocks.addEmail.mockRejectedValue({ code: '23505' })
    renderAdmin('/admin?sektion=adgang')

    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'medlem@example.com' } })
    email.focus()
    fireEvent.submit(email.closest('form')!)

    const error = await screen.findByText('Den e-mail står allerede på listen.')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(email)
  })

  it('keeps non-field invite failures as form-level alerts', async () => {
    mocks.addEmail.mockRejectedValue({ code: 'unexpected' })
    renderAdmin('/admin?sektion=adgang')

    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'medlem@example.com' } })
    fireEvent.submit(email.closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Den e-mail står allerede på listen.',
    )
    expect(email.getAttribute('aria-invalid')).toBeNull()
    expect(email.getAttribute('aria-describedby')).toBeNull()
  })
})
