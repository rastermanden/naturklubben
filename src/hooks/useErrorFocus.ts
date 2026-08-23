import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'

export function useErrorFocus<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [focusRequest, setFocusRequest] = useState(0)

  useLayoutEffect(() => {
    if (focusRequest > 0) ref.current?.focus()
  }, [focusRequest, ref])

  const requestErrorFocus = useCallback(() => {
    if (document.activeElement !== ref.current) {
      setFocusRequest((request) => request + 1)
    }
  }, [ref])

  return requestErrorFocus
}
