import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addEmail: vi.fn(),
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
      data: [],
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
  AdminRolesSection: () => null,
}))

import AdminPage from './AdminPage'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('AdminPage invite form errors', () => {
  it('links a duplicate server error to e-mail and focuses the field', async () => {
    mocks.addEmail.mockRejectedValue({ code: '23505' })
    render(<AdminPage />)

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
    render(<AdminPage />)

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
