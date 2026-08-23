import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  prepareSubscription: vi.fn(),
  PushSetupError: class PushSetupError extends Error {
    reason = 'unsupported' as const
  },
}))

vi.mock('../features/probation/useProbationApplications', () => ({
  useSubmitProbationApplication: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
  toFriendlyProbationApplicationError: () => 'Kontrollér felterne.',
}))
vi.mock('../features/notifications/usePushNotifications', () => {
  return {
    PushSetupError: mocks.PushSetupError,
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
  function fillForm() {
    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Maja Medlem' },
    })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'maja@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Hvorfor vil du være med?'), {
      target: { value: 'Jeg elsker naturen.' },
    })
  }

  function expectNoInvalidTextFields() {
    for (const field of [
      screen.getByLabelText('Navn'),
      screen.getByLabelText('E-mail'),
      screen.getByLabelText('Hvorfor vil du være med?'),
    ]) {
      expect(field.getAttribute('aria-invalid')).toBeNull()
      expect(field.getAttribute('aria-describedby')).toBeNull()
    }
  }

  it('keeps an undifferentiated invalid request at form level', async () => {
    mocks.mutateAsync.mockRejectedValue({ code: 'invalid_request' })
    render(
      <MemoryRouter>
        <ProbationApplicationPage />
      </MemoryRouter>,
    )

    fillForm()
    const submit = screen.getByRole('button', {
      name: 'Tillad notifikationer og send',
    })
    submit.focus()
    fireEvent.submit(submit.closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Kontrollér felterne.',
    )
    expectNoInvalidTextFields()
    expect(document.activeElement).toBe(submit)
  })

  it('keeps push-subscription failures at form level', async () => {
    mocks.prepareSubscription.mockRejectedValue(new mocks.PushSetupError())
    render(
      <MemoryRouter>
        <ProbationApplicationPage />
      </MemoryRouter>,
    )

    fillForm()
    const submit = screen.getByRole('button', {
      name: 'Tillad notifikationer og send',
    })
    submit.focus()
    fireEvent.submit(submit.closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Din browser kan ikke modtage svaret som notifikation',
    )
    expectNoInvalidTextFields()
    expect(document.activeElement).toBe(submit)
  })
})
