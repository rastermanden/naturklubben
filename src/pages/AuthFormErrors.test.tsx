import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({ supabase: { auth } }))
vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'member-id' } }, loading: false }),
}))
vi.mock('../features/auth/authCallbackUrl', () => ({
  authCallbackParams: { errorCode: null, errorDescription: null },
  clearAuthCallbackParams: vi.fn(),
}))

import ForgotPasswordPage from './ForgotPasswordPage'
import LoginPage from './LoginPage'
import ResetPasswordPage from './ResetPasswordPage'
import SignupPage from './SignupPage'

function renderPage(page: React.ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

function expectLinkedError(field: HTMLElement, alert: HTMLElement) {
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(field.getAttribute('aria-describedby')).toBe(alert.id)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('auth form errors', () => {
  it('links invalid login credentials to both fields and focuses the first one', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    renderPage(<LoginPage />)

    const email = screen.getByLabelText('E-mail')
    const password = screen.getByLabelText('Adgangskode')
    fireEvent.change(email, { target: { value: 'medlem@example.com' } })
    fireEvent.change(password, { target: { value: 'hemmelig' } })
    fireEvent.submit(email.closest('form')!)

    const error = await screen.findByText('Forkert e-mail eller adgangskode.')
    expectLinkedError(email, error)
    expectLinkedError(password, error)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(email)
  })

  it('does not make a field error live when its target already has focus', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    renderPage(<LoginPage />)

    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'medlem@example.com' } })
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'hemmelig' },
    })
    email.focus()
    fireEvent.submit(email.closest('form')!)

    const error = await screen.findByText('Forkert e-mail eller adgangskode.')
    expectLinkedError(email, error)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(email)
  })

  it('keeps unknown login failures as form-level alerts', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: 'network unavailable' },
    })
    renderPage(<LoginPage />)

    const email = screen.getByLabelText('E-mail')
    const password = screen.getByLabelText('Adgangskode')
    fireEvent.change(email, { target: { value: 'medlem@example.com' } })
    fireEvent.change(password, { target: { value: 'hemmelig' } })
    fireEvent.submit(email.closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Der skete en fejl. Prøv igen om lidt.',
    )
    expect(email.getAttribute('aria-invalid')).toBeNull()
    expect(password.getAttribute('aria-invalid')).toBeNull()
  })

  it('links an existing-account signup error only to e-mail', async () => {
    auth.signUp.mockResolvedValue({
      error: { message: 'User already registered' },
    })
    renderPage(<SignupPage />)

    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Maja Medlem' },
    })
    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'maja@example.com' } })
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'hemmelig' },
    })
    fireEvent.submit(email.closest('form')!)

    const error = await screen.findByText(
      'Der findes allerede en bruger med den e-mail.',
    )
    expectLinkedError(email, error)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByLabelText('Adgangskode').getAttribute('aria-invalid'),
    ).toBeNull()
    expect(document.activeElement).toBe(email)
  })

  it('keeps each field error non-live while moving focus between fields', async () => {
    auth.signUp
      .mockResolvedValueOnce({
        error: { message: 'User already registered' },
      })
      .mockResolvedValueOnce({
        error: { message: 'Password should be at least 6 characters' },
      })
    renderPage(<SignupPage />)

    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Maja Medlem' },
    })
    const email = screen.getByLabelText('E-mail')
    const password = screen.getByLabelText('Adgangskode')
    const submit = screen.getByRole('button', { name: 'Opret bruger' })
    fireEvent.change(email, { target: { value: 'maja@example.com' } })
    fireEvent.change(password, { target: { value: 'hemmelig' } })
    email.focus()
    fireEvent.submit(email.closest('form')!)
    expect(
      (await screen.findByText('Der findes allerede en bruger med den e-mail.'))
        .textContent,
    ).toContain('allerede en bruger')
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.change(password, { target: { value: 'kort' } })
    submit.focus()
    fireEvent.submit(email.closest('form')!)

    await screen.findByText('Adgangskoden skal være på mindst 6 tegn.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(password)
  })

  it('keeps unknown signup failures as form-level alerts', async () => {
    auth.signUp.mockResolvedValue({
      error: { message: 'network unavailable' },
    })
    renderPage(<SignupPage />)

    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Maja Medlem' },
    })
    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'maja@example.com' } })
    fireEvent.change(screen.getByLabelText('Adgangskode'), {
      target: { value: 'hemmelig' },
    })
    fireEvent.submit(email.closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Der skete en fejl. Prøv igen om lidt.',
    )
    expect(email.getAttribute('aria-invalid')).toBeNull()
    expect(
      screen.getByLabelText('Adgangskode').getAttribute('aria-invalid'),
    ).toBeNull()
  })

  it('keeps password-reset request errors as form-level alerts', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'request failed' },
    })
    renderPage(<ForgotPasswordPage />)

    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'medlem@example.com' } })
    fireEvent.submit(email.closest('form')!)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Der skete en fejl. Prøv igen om lidt.',
    )
    expect(email.getAttribute('aria-invalid')).toBeNull()
  })

  it('links a password mismatch to the repeated password and focuses it', async () => {
    renderPage(<ResetPasswordPage />)

    fireEvent.change(screen.getByLabelText('Ny adgangskode'), {
      target: { value: 'hemmelig' },
    })
    const repeated = screen.getByLabelText('Gentag adgangskoden')
    fireEvent.change(repeated, { target: { value: 'anderledes' } })
    fireEvent.submit(repeated.closest('form')!)

    const error = await screen.findByText('De to adgangskoder er ikke ens.')
    expectLinkedError(repeated, error)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(repeated)
    screen.getByRole('button', { name: 'Gem adgangskode' }).focus()
    fireEvent.submit(repeated.closest('form')!)
    await waitFor(() => expect(document.activeElement).toBe(repeated))
    await waitFor(() => expect(auth.updateUser).not.toHaveBeenCalled())
  })
})
