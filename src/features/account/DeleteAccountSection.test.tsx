import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountDeletionError } from './deleteAccount'
import { DeleteAccountDialog } from './DeleteAccountSection'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

afterEach(cleanup)

function fillConfirmation() {
  fireEvent.change(screen.getByLabelText('Nuværende adgangskode'), {
    target: { value: 'hemmelig' },
  })
  fireEvent.change(screen.getByLabelText(/Skriv SLET MIN KONTO/), {
    target: { value: 'SLET MIN KONTO' },
  })
}

describe('DeleteAccountDialog', () => {
  it('shows the permanent and anonymized consequences before confirmation', () => {
    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={() => undefined}
      />,
    )

    expect(screen.getByText('Slettes permanent')).toBeTruthy()
    expect(screen.getByText('Bevares anonymt')).toBeTruthy()
    expect(screen.getByText(/kan ikke fortrydes/i)).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'Slet min konto permanent',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('requires both password and the exact confirmation phrase', () => {
    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={() => undefined}
      />,
    )

    const deleteButton = screen.getByRole('button', {
      name: 'Slet min konto permanent',
    })
    fireEvent.change(screen.getByLabelText('Nuværende adgangskode'), {
      target: { value: 'hemmelig' },
    })
    fireEvent.change(screen.getByLabelText(/Skriv SLET MIN KONTO/), {
      target: { value: 'slet min konto' },
    })
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Skriv SLET MIN KONTO/), {
      target: { value: 'SLET MIN KONTO' },
    })
    expect((deleteButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks duplicate submits and reports success once', async () => {
    let finishDeletion: (() => void) | undefined
    const deleteRequest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDeletion = resolve
        }),
    )
    const onDeleted = vi.fn()

    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={onDeleted}
        deleteRequest={deleteRequest}
      />,
    )
    fillConfirmation()

    const deleteButton = screen.getByRole('button', {
      name: 'Slet min konto permanent',
    })
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)

    expect(deleteRequest).toHaveBeenCalledTimes(1)
    expect(
      (
        screen.getByRole('button', {
          name: 'Sletter konto…',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    finishDeletion?.()
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('keeps the dialog open and shows a specific server error', async () => {
    const onDeleted = vi.fn()

    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={onDeleted}
        deleteRequest={() =>
          Promise.reject(new AccountDeletionError('last_admin'))
        }
      />,
    )
    fillConfirmation()
    fireEvent.click(
      screen.getByRole('button', { name: 'Slet min konto permanent' }),
    )

    expect((await screen.findByRole('alert')).textContent).toContain(
      'sidste administrator',
    )
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('links an invalid-password error to the password and focuses it', async () => {
    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={() => undefined}
        deleteRequest={() =>
          Promise.reject(new AccountDeletionError('invalid_password'))
        }
      />,
    )
    fillConfirmation()
    fireEvent.click(
      screen.getByRole('button', { name: 'Slet min konto permanent' }),
    )

    const error = await screen.findByText('Adgangskoden er forkert. Prøv igen.')
    const password = screen.getByLabelText('Nuværende adgangskode')
    expect(password.getAttribute('aria-invalid')).toBe('true')
    expect(password.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(password)
  })

  it('links a confirmation error to the confirmation and focuses it after submit', async () => {
    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={() => undefined}
        deleteRequest={() =>
          Promise.reject(new AccountDeletionError('invalid_confirmation'))
        }
      />,
    )
    fillConfirmation()
    fireEvent.click(
      screen.getByRole('button', { name: 'Slet min konto permanent' }),
    )

    const error = await screen.findByText(/Skriv SLET MIN KONTO præcis/)
    const confirmation = screen.getByLabelText(/Skriv SLET MIN KONTO/)
    expect(confirmation.getAttribute('aria-invalid')).toBe('true')
    expect(confirmation.getAttribute('aria-describedby')).toBe(error.id)
    expect(document.activeElement).toBe(confirmation)
  })
})
