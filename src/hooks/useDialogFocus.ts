import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.closest('[inert]'),
  )
}

interface DialogFocusOptions {
  open?: boolean
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function useDialogFocus<T extends HTMLElement>({
  open = true,
  onClose,
  initialFocusRef,
  returnFocusRef,
}: DialogFocusOptions) {
  const dialogRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const returnTarget = returnFocusRef?.current ?? previouslyFocused
    const dialog = dialogRef.current
    if (!dialog) return
    const dialogElement = dialog

    const initialFocus =
      initialFocusRef?.current ??
      getFocusableElements(dialogElement)[0] ??
      dialogElement
    initialFocus.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(dialogElement)
      if (focusable.length === 0) {
        event.preventDefault()
        dialogElement.focus()
        return
      }

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const activeElement = document.activeElement

      if (
        event.shiftKey &&
        (activeElement === first || !dialogElement.contains(activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (activeElement === last || !dialogElement.contains(activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (returnTarget?.isConnected) returnTarget.focus()
    }
  }, [initialFocusRef, open, returnFocusRef])

  return dialogRef
}
