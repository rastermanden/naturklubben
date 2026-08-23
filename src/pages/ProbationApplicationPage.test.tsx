import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  prepareSubscription: vi.fn(),
}))

vi.mock('../features/probation/useProbationApplications', () => ({
  useSubmitProbationApplication: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
  toFriendlyProbationApplicationError: () => 'Kontrollér felterne.',
}))
vi.mock('../features/notifications/usePushNotifications', () => {
  class PushSetupError extends Error {
    reason = 'unsupported' as const
  }
  return {
    PushSetupError,
    prepareBrowserPushSubscription: mocks.prepareSubscription,
  }
})

import ProbationApplicationPage from './ProbationApplicationPage'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prepareSubscription.mockResolvedValue({ endpoint: 'https://push.test' })
})

afterEach(cleanup)

describe('ProbationApplicationPage form errors', () => {
  it('links server-side field validation to all submitted fields and focuses the first', async () => {
    mocks.mutateAsync.mockRejectedValue({ code: 'invalid_request' })
    render(
      <MemoryRouter>
        <ProbationApplicationPage />
      </MemoryRouter>,
    )

    const name = screen.getByLabelText('Navn')
    const email = screen.getByLabelText('E-mail')
    const motivation = screen.getByLabelText('Hvorfor vil du være med?')
    fireEvent.change(name, { target: { value: 'Maja Medlem' } })
    fireEvent.change(email, { target: { value: 'maja@example.com' } })
    fireEvent.change(motivation, { target: { value: 'Jeg elsker naturen.' } })
    fireEvent.submit(name.closest('form')!)

    const error = await screen.findByText('Kontrollér felterne.')
    for (const field of [name, email, motivation]) {
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.getAttribute('aria-describedby')).toBe(error.id)
    }
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(name)
  })
})
