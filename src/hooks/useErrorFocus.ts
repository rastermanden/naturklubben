import { useLayoutEffect, useState, type RefObject } from 'react'

export function useErrorFocus<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [focusRequest, setFocusRequest] = useState(0)

  useLayoutEffect(() => {
    if (focusRequest > 0) ref.current?.focus()
  }, [focusRequest, ref])

  return () => setFocusRequest((request) => request + 1)
}
