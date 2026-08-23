import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

afterEach(cleanup)

function TestDialog({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void
  returnFocusRef: React.RefObject<HTMLButtonElement | null>
}) {
  const firstRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: firstRef,
    returnFocusRef,
  })

  return (
    <div ref={dialogRef} role="dialog" aria-label="Testdialog" tabIndex={-1}>
      <button ref={firstRef} type="button" onClick={onClose}>
        Luk
      </button>
      <button type="button">Sidste handling</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Åbn
      </button>
      {open && (
        <TestDialog
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
        />
      )}
    </>
  )
}

describe('useDialogFocus', () => {
  it('sets initial focus, traps Tab, closes on Escape, and restores focus', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Åbn' })
    trigger.focus()
    fireEvent.click(trigger)

    const closeButton = screen.getByRole('button', { name: 'Luk' })
    const lastButton = screen.getByRole('button', { name: 'Sidste handling' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastButton)

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(document.activeElement).toBe(trigger)
  })

  it('restores focus when a dialog action closes it', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Åbn' })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: 'Luk' }))

    expect(screen.queryByRole('dialog')).toBe(null)
    expect(document.activeElement).toBe(trigger)
  })
})
