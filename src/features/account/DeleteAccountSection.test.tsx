import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AccountDeletionError } from './deleteAccount'
import { AccountExportError } from './exportAccount'
import {
  DeleteAccountDialog,
  DeleteAccountSection,
  ExportAccountDialog,
} from './DeleteAccountSection'

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
  it('traps Tab in the dialog', () => {
    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={() => undefined}
        onDeleted={() => undefined}
      />,
    )

    const password = screen.getByLabelText('Nuværende adgangskode')
    const cancel = screen.getByRole('button', { name: 'Annullér' })
    expect(document.activeElement).toBe(password)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(password)
  })

  describe('ExportAccountDialog', () => {
    it('blocks duplicate requests, downloads on success, and can download again', async () => {
      let finishExport: ((data: { version: number }) => void) | undefined
      const exportRequest = vi.fn(
        () =>
          new Promise<{ version: number }>((resolve) => {
            finishExport = resolve
          }),
      )
      const download = vi.fn()

      render(
        <ExportAccountDialog
          email="medlem@example.com"
          onClose={() => undefined}
          exportRequest={exportRequest}
          download={download}
        />,
      )
      fireEvent.change(screen.getByLabelText('Nuværende adgangskode'), {
        target: { value: 'hemmelig' },
      })
      const exportButton = screen.getByRole('button', {
        name: 'Hent data som JSON',
      })
      fireEvent.click(exportButton)
      fireEvent.click(exportButton)

      expect(exportRequest).toHaveBeenCalledTimes(1)
      expect(
        screen.getByRole('button', { name: 'Samler dine data…' }),
      ).toBeTruthy()

      finishExport?.({ version: 1 })
      expect((await screen.findByRole('status')).textContent).toContain(
        'Din dataudlevering er hentet.',
      )
      expect(download).toHaveBeenCalledWith({ version: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Download igen' }))
      expect(download).toHaveBeenCalledTimes(2)
    })

    it('shows and focuses an invalid-password error', async () => {
      render(
        <ExportAccountDialog
          email="medlem@example.com"
          onClose={() => undefined}
          exportRequest={() =>
            Promise.reject(new AccountExportError('invalid_password'))
          }
        />,
      )
      const password = screen.getByLabelText('Nuværende adgangskode')
      fireEvent.change(password, { target: { value: 'forkert' } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Hent data som JSON' }),
      )

      const error = await screen.findByText(
        'Adgangskoden er forkert. Prøv igen.',
      )
      expect(password.getAttribute('aria-invalid')).toBe('true')
      expect(password.getAttribute('aria-describedby')).toBe(error.id)
      expect(document.activeElement).toBe(password)
    })

    it('is available next to account deletion', () => {
      render(
        <MemoryRouter>
          <DeleteAccountSection email="medlem@example.com" />
        </MemoryRouter>,
      )

      expect(
        screen.getByRole('button', { name: 'Hent mine data' }),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Start kontosletning' }),
      ).toBeTruthy()
    })
  })

  it('closes on Escape and returns focus to the trigger', () => {
    render(
      <MemoryRouter>
        <DeleteAccountSection email="medlem@example.com" />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Start kontosletning' })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the trigger after cancelling', () => {
    render(
      <MemoryRouter>
        <DeleteAccountSection email="medlem@example.com" />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Start kontosletning' })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: 'Annullér' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('does not close on Escape while deletion is pending', () => {
    const onClose = vi.fn()
    render(
      <DeleteAccountDialog
        email="medlem@example.com"
        onClose={onClose}
        onDeleted={() => undefined}
        deleteRequest={() => new Promise(() => undefined)}
      />,
    )
    fillConfirmation()
    const deleteButton = screen.getByRole('button', {
      name: 'Slet min konto permanent',
    })
    deleteButton.focus()
    fireEvent.click(deleteButton)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

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
    const deleteButton = screen.getByRole('button', {
      name: 'Slet min konto permanent',
    })
    deleteButton.focus()
    fireEvent.click(deleteButton)

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
    const deleteButton = screen.getByRole('button', {
      name: 'Slet min konto permanent',
    })
    const password = screen.getByLabelText('Nuværende adgangskode')
    deleteButton.focus()
    fireEvent.click(deleteButton)
    password.focus()

    const error = await screen.findByText('Adgangskoden er forkert. Prøv igen.')
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
